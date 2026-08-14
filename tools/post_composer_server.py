from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import posixpath
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
POSTS_DIR = REPO_ROOT / "_posts"
POST_ASSETS_DIR = REPO_ROOT / "assets" / "posts"
VALID_FILE_RE = re.compile(r"^[A-Za-z0-9._-]+\.md$")
VALID_SLUG_RE = re.compile(r"^[a-z0-9-]+$")
VALID_ASSET_EXTENSION_RE = re.compile(r"^\.[a-z0-9]{1,8}$")
MAX_POST_SIZE = 5 * 1024 * 1024
MAX_IMAGE_SIZE = 25 * 1024 * 1024
MAX_REQUEST_SIZE = 36 * 1024 * 1024
TOKEN_HEADER = "X-Post-Composer-Token"
LEGACY_PID_FILE = REPO_ROOT / "tmp" / "post-composer-server.pid"
DEFAULT_RECORD_FILE = REPO_ROOT / "tmp" / "post-composer-server.json"
SERVER_LOG_FILE = REPO_ROOT / "tmp" / "post-composer-server.log"
SERVER_ERR_FILE = REPO_ROOT / "tmp" / "post-composer-server.err.log"
LOCAL_VISIBILITY_FILE = REPO_ROOT / "tmp" / "local-post-visibility.json"
# 覆盖保存和删除都是不可逆的整文件操作，先往这里留一份。tmp/ 已在 .gitignore 中。
POST_BACKUP_DIR = REPO_ROOT / "tmp" / "post-backups"
MAX_BACKUPS_PER_POST = 10


def hidden_subprocess_kwargs() -> dict[str, object]:
    if os.name != "nt":
        return {}

    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return {
        "creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0),
        "startupinfo": startupinfo,
    }


def run_git(args: list[str], check: bool = True, timeout: int = 90) -> subprocess.CompletedProcess[str]:
    # GIT_TERMINAL_PROMPT=0 + stdin 关掉：否则凭证过期时 git 会在后台进程里
    # 等一个永远不会有人输入的用户名，整个发布就挂死在那儿。
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_OPTIONAL_LOCKS="0")
    try:
        return subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=check,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            env=env,
            **hidden_subprocess_kwargs(),
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            f"git {' '.join(args[:2])} 超过 {timeout} 秒没有返回，已中止。"
            "常见原因是网络不通或远端要求输入凭证。"
        ) from error


def explain_git_error(message: str) -> str:
    """把 git 的英文报错翻成能照着做的中文提示。"""
    lowered = message.lower()
    if "rejected" in lowered and ("fetch first" in lowered or "non-fast-forward" in lowered):
        return "远端有你本地还没有的提交。请先在仓库里跑 git pull --rebase，再回来重试发布。\n\n原始信息：" + message
    if "could not read username" in lowered or "authentication failed" in lowered or "permission denied" in lowered:
        return "推送时认证失败，凭证可能已过期。请在终端手动跑一次 git push 完成认证后再重试。\n\n原始信息：" + message
    if "could not resolve host" in lowered or "failed to connect" in lowered or "timed out" in lowered:
        return "连不上远端仓库，请检查网络后重试。\n\n原始信息：" + message
    if "please tell me who you are" in lowered or "author identity unknown" in lowered:
        return "git 还没配置提交身份。请先跑 git config user.name 和 git config user.email。\n\n原始信息：" + message
    return message


def status_url(port: int) -> str:
    return f"http://127.0.0.1:{port}/status"


def fetch_status(port: int) -> dict[str, object] | None:
    try:
        with urlopen(status_url(port), timeout=2) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None
    if result.get("ok") is True and result.get("service") == "post-composer" and result.get("requestToken"):
        return result
    return None


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def read_record(record_file: Path) -> dict[str, object] | None:
    try:
        record = json.loads(record_file.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return record if isinstance(record, dict) else None


def remove_legacy_pid_file() -> None:
    try:
        LEGACY_PID_FILE.unlink()
    except FileNotFoundError:
        pass


def manage_start(port: int, record_file: Path, entry_point: str) -> int:
    record_file.parent.mkdir(parents=True, exist_ok=True)
    SERVER_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    remove_legacy_pid_file()

    existing_status = fetch_status(port)
    if existing_status:
        print(f"Post Composer is already running at http://127.0.0.1:{port}/post-composer.html")
        return 0
    if port_is_open(port):
        print(f"Port {port} is already in use by an unknown or outdated service.", file=sys.stderr)
        return 1

    instance_id = secrets.token_urlsafe(24)
    creationflags = 0
    start_new_session = os.name != "nt"
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)

    with SERVER_LOG_FILE.open("a", encoding="utf-8") as stdout_file, SERVER_ERR_FILE.open("a", encoding="utf-8") as stderr_file:
        process = subprocess.Popen(  # noqa: S603
            [sys.executable, str(Path(__file__).resolve()), "--port", str(port), "--instance-id", instance_id],
            cwd=REPO_ROOT,
            stdout=stdout_file,
            stderr=stderr_file,
            creationflags=creationflags,
            start_new_session=start_new_session,
        )

    deadline = time.time() + 5
    status = None
    while time.time() < deadline:
        status = fetch_status(port)
        if status and status.get("instanceId") == instance_id:
            break
        if process.poll() is not None:
            break
        time.sleep(0.2)

    if not status or status.get("instanceId") != instance_id:
        if process.poll() is None:
            process.terminate()
        print(f"Post Composer failed to start. Check {SERVER_ERR_FILE}.", file=sys.stderr)
        return 1

    record_file.write_text(
        json.dumps(
            {
                "service": "post-composer",
                "pid": process.pid,
                "port": port,
                "entryPoint": entry_point,
                "instanceId": instance_id,
                "startedAtUtc": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Post Composer is running at http://127.0.0.1:{port}/post-composer.html")
    return 0


def manage_stop(record_file: Path) -> int:
    remove_legacy_pid_file()
    record = read_record(record_file)
    if not record:
        try:
            record_file.unlink()
        except FileNotFoundError:
            pass
        print("No owned Post Composer process record was found.")
        return 0

    port = record.get("port")
    pid = record.get("pid")
    instance_id = record.get("instanceId")
    status = fetch_status(int(port)) if isinstance(port, int) else None
    owned = (
        isinstance(pid, int)
        and isinstance(instance_id, str)
        and status is not None
        and status.get("instanceId") == instance_id
    )
    if owned:
        try:
            os.kill(pid, signal.SIGTERM)
            print(f"Stopped Post Composer (PID {pid}).")
        except OSError:
            print("Post Composer was no longer running.")
    else:
        print("Post Composer ownership could not be verified; no process was stopped.")

    try:
        record_file.unlink()
    except FileNotFoundError:
        pass
    return 0


def normalize_post_file_name(value: str) -> str:
    candidate = Path(str(value).strip()).name
    if not VALID_FILE_RE.fullmatch(candidate):
        raise ValueError("invalid post file name")
    return candidate


def normalize_asset_slug(value: str) -> str:
    candidate = str(value).strip()
    if not VALID_SLUG_RE.fullmatch(candidate):
        raise ValueError("invalid asset slug")
    return candidate


def collect_publish_paths(file_name: str, asset_slug: str) -> list[str]:
    paths = [f"_posts/{file_name}"]
    asset_dir = REPO_ROOT / "assets" / "posts" / asset_slug
    if asset_dir.exists():
        paths.append(f"assets/posts/{asset_slug}")
    return paths


def build_commit_message(mode: str, file_name: str) -> str:
    action = "add" if mode == "create" else "update"
    return f"post: {action} {file_name}"


def get_publish_context(payload: dict[str, object]) -> tuple[str, str, str, list[str]]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    asset_slug = normalize_asset_slug(str(payload.get("assetSlug", "")))
    mode = str(payload.get("mode", "edit")).strip().lower()
    if mode not in {"create", "edit"}:
        mode = "edit"
    return file_name, asset_slug, mode, collect_publish_paths(file_name, asset_slug)


def list_post_documents() -> list[dict[str, object]]:
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError("博客项目缺少 _posts 目录。")

    posts = []
    for target in sorted(POSTS_DIR.glob("*.md")):
        posts.append(
            {
                "fileName": target.name,
                "source": target.read_text(encoding="utf-8"),
                "lastModified": int(target.stat().st_mtime * 1000),
            }
        )
    return posts


def read_local_visibility() -> set[str]:
    try:
        data = json.loads(LOCAL_VISIBILITY_FILE.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return set()

    hidden_posts = data.get("hiddenPosts") if isinstance(data, dict) else []
    if not isinstance(hidden_posts, list):
        return set()

    valid_posts = set()
    for item in hidden_posts:
        if not isinstance(item, str):
            continue
        try:
            valid_posts.add(normalize_post_file_name(item))
        except ValueError:
            continue
    return valid_posts


def write_local_visibility(hidden_posts: set[str]) -> None:
    LOCAL_VISIBILITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {"hiddenPosts": sorted(hidden_posts)}
    LOCAL_VISIBILITY_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def post_has_published_false(target: Path) -> bool:
    try:
        source = target.read_text(encoding="utf-8-sig")
    except OSError:
        return False
    return re.search(r"(?m)^published:\s*false\s*$", source) is not None


def read_published_hidden_posts() -> set[str]:
    if not POSTS_DIR.is_dir():
        return set()
    return {target.name for target in POSTS_DIR.glob("*.md") if post_has_published_false(target)}


def set_post_published_state(target: Path, hidden: bool) -> bool:
    source = target.read_text(encoding="utf-8-sig")
    normalized = source.replace("\r\n", "\n")
    end_index = normalized.find("\n---\n", 4) if normalized.startswith("---\n") else -1

    if end_index == -1:
        front_matter = ""
        body = normalized
    else:
        front_matter = normalized[4:end_index]
        body = normalized[end_index + 5 :]
        if body.startswith("\n"):
            body = body[1:]

    found = False
    next_lines = []
    for line in front_matter.split("\n") if front_matter else []:
        if re.match(r"^published\s*:", line):
            found = True
            if hidden:
                next_lines.append("published: false")
            continue
        next_lines.append(line)

    if hidden and not found:
        next_lines.append("published: false")

    if next_lines:
        next_source = "---\n" + "\n".join(next_lines).rstrip() + "\n---\n\n" + body.lstrip("\n")
    else:
        next_source = body.lstrip("\n")

    if not next_source.endswith("\n"):
        next_source += "\n"
    if next_source == normalized:
        return False

    target.write_text(next_source, encoding="utf-8", newline="\n")
    return True


def commit_and_push_visibility_change(file_name: str, hidden: bool) -> dict[str, object]:
    path = f"_posts/{file_name}"
    add_result = run_git(["add", "--", path], check=False)
    if add_result.returncode != 0:
        raise RuntimeError((add_result.stderr or add_result.stdout or "git add failed").strip())

    staged_result = run_git(["diff", "--cached", "--name-only", "--", path], check=False)
    if staged_result.returncode != 0:
        raise RuntimeError((staged_result.stderr or staged_result.stdout or "git diff failed").strip())
    staged_files = [line.strip() for line in staged_result.stdout.splitlines() if line.strip()]
    if not staged_files:
        return {"ok": True, "status": "noop", "message": "No published visibility change to commit.", "paths": [path]}

    action = "hide" if hidden else "show"
    commit_message = f"post: {action} {file_name}"
    commit_result = run_git(["commit", "--only", "-m", commit_message, "--", path], check=False)
    if commit_result.returncode != 0:
        raise RuntimeError((commit_result.stderr or commit_result.stdout or "git commit failed").strip())

    push_result = run_git(["push", "origin", "HEAD"], check=False)
    if push_result.returncode != 0:
        return {
            "ok": False,
            "status": "committed_not_pushed",
            "message": "Visibility was committed locally, but git push failed: " + (push_result.stderr or push_result.stdout or "git push failed").strip(),
            "commitMessage": commit_message,
            "paths": staged_files,
        }

    return {
        "ok": True,
        "status": "published",
        "message": "Visibility was committed and pushed.",
        "commitMessage": commit_message,
        "paths": staged_files,
    }


def local_visibility_payload() -> dict[str, object]:
    return {"ok": True, "hiddenPosts": sorted(read_local_visibility() | read_published_hidden_posts())}


def update_local_visibility(payload: dict[str, object]) -> dict[str, object]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    target = POSTS_DIR / file_name
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"未找到文章文件 {file_name}。")

    hidden = bool(payload.get("hidden", False))
    changed = set_post_published_state(target, hidden)

    hidden_posts = read_local_visibility() | read_published_hidden_posts()
    if hidden:
        hidden_posts.add(file_name)
    else:
        hidden_posts.discard(file_name)
    write_local_visibility(hidden_posts)

    publish_result = commit_and_push_visibility_change(file_name, hidden) if changed else {
        "ok": True,
        "status": "noop",
        "message": "Post visibility was already up to date.",
        "paths": [f"_posts/{file_name}"],
    }
    if not publish_result.get("ok"):
        return {
            "ok": False,
            "fileName": file_name,
            "hidden": hidden,
            "hiddenPosts": sorted(hidden_posts),
            "publish": publish_result,
            "message": publish_result.get("message"),
        }
    return {
        "ok": True,
        "fileName": file_name,
        "hidden": hidden,
        "hiddenPosts": sorted(hidden_posts),
        "publish": publish_result,
        "message": publish_result.get("message"),
    }


def backup_post_file(target: Path) -> None:
    """覆盖或删除前留一份副本，每篇最多保留最近 MAX_BACKUPS_PER_POST 份。"""
    if not target.is_file():
        return

    try:
        POST_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(target, POST_BACKUP_DIR / f"{target.name}.{stamp}.bak")

        existing = sorted(
            POST_BACKUP_DIR.glob(f"{target.name}.*.bak"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for stale in existing[MAX_BACKUPS_PER_POST:]:
            stale.unlink(missing_ok=True)
    except OSError:
        # 备份失败不该阻断保存本身，用户的正文更重要
        pass


def save_post(payload: dict[str, object]) -> dict[str, object]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    markdown = payload.get("markdown")
    overwrite = bool(payload.get("overwrite", False))
    mode = str(payload.get("mode", "create")).strip().lower()
    if not isinstance(markdown, str) or not markdown.strip():
        raise ValueError("文章内容不能为空。")
    if len(markdown.encode("utf-8")) > MAX_POST_SIZE:
        raise ValueError("文章内容过大，无法保存。")
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError("博客项目缺少 _posts 目录。")

    target = POSTS_DIR / file_name
    if mode == "create" and target.exists() and not overwrite:
        return {
            "ok": False,
            "status": "conflict",
            "message": f"{file_name} 已存在，是否覆盖？",
            "fileName": file_name,
        }

    backup_post_file(target)
    target.write_text(markdown, encoding="utf-8", newline="\n")
    return {"ok": True, "status": "saved", "fileName": file_name}


def delete_post(payload: dict[str, object]) -> dict[str, object]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError("博客项目缺少 _posts 目录。")
    target = POSTS_DIR / file_name
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"未找到文章文件 {file_name}。")
    backup_post_file(target)
    target.unlink()

    # 一并清掉这篇文章的图片目录，否则 assets/posts/<slug>/ 会永远留在仓库里
    removed_assets = False
    asset_slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", file_name[:-3])
    if VALID_SLUG_RE.fullmatch(asset_slug):
        asset_dir = POST_ASSETS_DIR / asset_slug
        if asset_dir.is_dir():
            try:
                shutil.move(str(asset_dir), str(POST_BACKUP_DIR / f"{asset_slug}-assets-{datetime.now().strftime('%Y%m%d-%H%M%S')}"))
                removed_assets = True
            except OSError:
                pass

    hidden_posts = read_local_visibility()
    if file_name in hidden_posts:
        hidden_posts.discard(file_name)
        write_local_visibility(hidden_posts)

    # 说清楚：只动了本地文件，线上那篇还在，要等下一次 push 才会同步
    message = f"已删除本地文件 {file_name}"
    if removed_assets:
        message += f"，并移走了图片目录 assets/posts/{asset_slug}/"
    message += "。备份在 tmp/post-backups/。注意：线上文章要等这次删除被提交并推送后才会消失。"
    return {"ok": True, "message": message, "backedUp": True}


def sanitize_image_name(original_name: str) -> str:
    original = Path(str(original_name).strip()).name
    extension = Path(original).suffix.lower()
    if not VALID_ASSET_EXTENSION_RE.fullmatch(extension):
        extension = ".png"
    stem = re.sub(r"[^a-z0-9]+", "-", Path(original).stem.lower()).strip("-") or "image"
    return f"{stem}{extension}"


def import_image(payload: dict[str, object]) -> dict[str, object]:
    asset_slug = normalize_asset_slug(str(payload.get("assetSlug", "")))
    file_name = sanitize_image_name(str(payload.get("fileName", "image.png")))
    encoded = payload.get("base64")
    if not isinstance(encoded, str) or not encoded:
        raise ValueError("图片数据为空。")
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("图片数据无效。") from error
    if not image_bytes or len(image_bytes) > MAX_IMAGE_SIZE:
        raise ValueError("图片为空或超过 25 MB 限制。")

    directory = POST_ASSETS_DIR / asset_slug
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / file_name
    suffix = target.suffix
    stem = target.stem
    index = 2
    while target.exists():
        target = directory / f"{stem}-{index}{suffix}"
        index += 1
    target.write_bytes(image_bytes)
    return {
        "ok": True,
        "fileName": target.name,
        "webPath": f"/assets/posts/{asset_slug}/{target.name}",
    }


def path_is_targeted(path: str, targets: list[str]) -> bool:
    return any(path == target or path.startswith(f"{target}/") for target in targets)


def publish_preview(payload: dict[str, object]) -> dict[str, object]:
    file_name, asset_slug, mode, paths = get_publish_context(payload)
    status_result = run_git(["status", "--porcelain", "--", *paths])
    changes = [line.strip() for line in status_result.stdout.splitlines() if line.strip()]
    branch_result = run_git(["branch", "--show-current"], check=False)
    branch = branch_result.stdout.strip() or "(detached HEAD)"
    staged_result = run_git(["diff", "--cached", "--name-only"], check=False)
    staged_paths = [line.strip() for line in staged_result.stdout.splitlines() if line.strip()]
    other_staged_paths = [path for path in staged_paths if not path_is_targeted(path, paths)]

    ahead_count = 0
    upstream_result = run_git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], check=False)
    upstream = upstream_result.stdout.strip() if upstream_result.returncode == 0 else ""
    if upstream:
        ahead_result = run_git(["rev-list", "--count", f"{upstream}..HEAD"], check=False)
        if ahead_result.returncode == 0 and ahead_result.stdout.strip().isdigit():
            ahead_count = int(ahead_result.stdout.strip())

    # 三态：ready 有未提交改动；ahead 没有改动但本地有提交还没推上去
    # （上次 push 失败就会卡在这个状态，以前会被当成 noop 直接拒绝，再也发不出去）；
    # noop 才是真的没事可做。
    if changes:
        status = "ready"
        message = "已准备发布检查。"
    elif ahead_count > 0:
        status = "ahead"
        message = f"这篇文章没有新的改动，但本地还有 {ahead_count} 个提交没有推送到远端。"
    else:
        status = "noop"
        message = "当前文章没有可发布的 Git 改动。"

    return {
        "ok": True,
        "status": status,
        "message": message,
        "fileName": file_name,
        "assetSlug": asset_slug,
        "mode": mode,
        "paths": paths,
        "changes": changes,
        "branch": branch,
        "upstream": upstream,
        "aheadCount": ahead_count,
        "otherStagedPaths": other_staged_paths,
    }


def publish_post(payload: dict[str, object]) -> dict[str, object]:
    file_name, _asset_slug, mode, paths = get_publish_context(payload)
    preview = publish_preview(payload)

    if preview["status"] == "noop":
        return {
            "ok": True,
            "status": "noop",
            "message": "当前文章没有可发布的 Git 改动。",
            "paths": paths,
        }

    # 这篇没有新改动，但本地攒了未推送的提交（多半是上次 push 失败）。
    # 跳过 add/commit，直接补一次推送。
    if preview["status"] == "ahead":
        push_result = run_git(["push", "origin", "HEAD"], check=False)
        if push_result.returncode != 0:
            return {
                "ok": False,
                "status": "committed_not_pushed",
                "message": "补推失败：" + explain_git_error((push_result.stderr or push_result.stdout or "git push failed").strip()),
                "paths": paths,
            }
        return {
            "ok": True,
            "status": "published",
            "message": f"已把本地 {preview['aheadCount']} 个待推送提交推到远端。",
            "paths": paths,
        }

    add_result = run_git(["add", "--", *paths], check=False)
    if add_result.returncode != 0:
        raise RuntimeError((add_result.stderr or add_result.stdout or "git add failed").strip())

    staged_result = run_git(["diff", "--cached", "--name-only", "--", *paths])
    staged_files = [line.strip() for line in staged_result.stdout.splitlines() if line.strip()]
    if not staged_files:
        return {
            "ok": True,
            "status": "noop",
            "message": "当前文章没有新的可提交内容。",
            "paths": paths,
        }

    commit_message = build_commit_message(mode, file_name)
    commit_result = run_git(["commit", "--only", "-m", commit_message, "--", *paths], check=False)
    if commit_result.returncode != 0:
        raise RuntimeError(explain_git_error((commit_result.stderr or commit_result.stdout or "git commit failed").strip()))

    push_result = run_git(["push", "origin", "HEAD"], check=False)
    if push_result.returncode != 0:
        return {
            "ok": False,
            "status": "committed_not_pushed",
            "message": "文章已提交到本地，但推送失败：\n"
            + explain_git_error((push_result.stderr or push_result.stdout or "git push failed").strip())
            + "\n\n改动没有丢，修好后再点一次「保存并发送」就会补推。",
            "commitMessage": commit_message,
            "paths": staged_files,
        }

    return {
        "ok": True,
        "status": "published",
        "message": "已提交并推送当前文章。",
        "commitMessage": commit_message,
        "paths": staged_files,
    }


class ComposerRequestHandler(SimpleHTTPRequestHandler):
    def __init__(
        self,
        *args,
        request_token: str,
        instance_id: str,
        server_port: int,
        directory: str | None = None,
        **kwargs,
    ):
        self.request_token = request_token
        self.instance_id = instance_id
        self.server_port = server_port
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        if not self.has_allowed_host():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "不允许的本地服务主机名。"})
            return

        request_path = urlsplit(self.path).path
        if request_path == "/status":
            self.respond_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "post-composer",
                    "repositoryName": REPO_ROOT.name,
                    "requestToken": self.request_token,
                    "instanceId": self.instance_id,
                },
            )
            return
        if request_path == "/api/posts":
            if not self.has_request_token():
                self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "本地服务会话无效，请刷新页面重新连接。"})
                return
            try:
                self.respond_json(HTTPStatus.OK, {"ok": True, "posts": list_post_documents()})
            except Exception as error:  # noqa: BLE001
                self.respond_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": str(error)})
            return
        if request_path == "/api/local-post-visibility":
            self.respond_json(HTTPStatus.OK, local_visibility_payload(), extra_headers=self.local_cors_headers())
            return

        static_path = self.resolve_static_path(request_path)
        if static_path:
            self.serve_static_file(static_path)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_HEAD(self) -> None:
        if not self.has_allowed_host():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "不允许的本地服务主机名。"})
            return
        self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def do_POST(self) -> None:
        if not self.has_allowed_host():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "不允许的本地服务主机名。"})
            return

        request_path = urlsplit(self.path).path
        if request_path not in {"/api/posts/save", "/api/posts/delete", "/api/local-post-visibility", "/api/images/import", "/publish/preview", "/publish"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        if not self.has_request_token() or not self.is_same_origin_json_request():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "仅允许本地发帖器发起写入操作。"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 0:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid content length"})
            return
        if length > MAX_REQUEST_SIZE:
            self.respond_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"ok": False, "message": "请求内容超过大小限制。"})
            return

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid json payload"})
            return
        if not isinstance(payload, dict):
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid json payload"})
            return

        try:
            if request_path == "/api/posts/save":
                result = save_post(payload)
                status = HTTPStatus.CONFLICT if result.get("status") == "conflict" else HTTPStatus.OK
            elif request_path == "/api/posts/delete":
                result = delete_post(payload)
                status = HTTPStatus.OK
            elif request_path == "/api/local-post-visibility":
                result = update_local_visibility(payload)
                status = HTTPStatus.OK
            elif request_path == "/api/images/import":
                result = import_image(payload)
                status = HTTPStatus.OK
            elif request_path == "/publish/preview":
                result = publish_preview(payload)
                status = HTTPStatus.OK
            else:
                result = publish_post(payload)
                status = HTTPStatus.OK if result.get("ok") else HTTPStatus.BAD_GATEWAY
            self.respond_json(status, result)
        except ValueError as error:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": str(error)})
        except Exception as error:  # noqa: BLE001
            self.respond_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": str(error)})

    def has_allowed_host(self) -> bool:
        host = self.headers.get("Host", "").strip().lower()
        if host in {f"127.0.0.1:{self.server_port}", f"localhost:{self.server_port}"}:
            return True
        # Support LAN access (e.g. 192.168.x.x:4173)
        return bool(re.match(r"^(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$", host))

    def has_request_token(self) -> bool:
        token = self.headers.get(TOKEN_HEADER, "")
        return bool(token) and secrets.compare_digest(token, self.request_token)

    def is_same_origin_json_request(self) -> bool:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            return False
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        return origin == f"http://{host}"

    def local_cors_headers(self) -> dict[str, str]:
        origin = self.headers.get("Origin", "").strip().lower()
        if re.fullmatch(r"http://(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+", origin):
            return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
        return {}

    def static_content_type(self, target: Path) -> str:
        content_type = self.guess_type(str(target))
        lower_content_type = content_type.lower()
        if "charset=" in lower_content_type:
            return content_type
        if lower_content_type.startswith("text/") or lower_content_type in {
            "application/javascript",
            "application/json",
            "application/xml",
            "image/svg+xml",
        }:
            return f"{content_type}; charset=utf-8"
        return content_type

    def end_headers(self) -> None:
        self.send_header(
            "Content-Security-Policy",
            # style-src / font-src 放行 post-composer.html 通过 <link> 加载的 Google Fonts。
            # connect-src 放行本地与 GitHub REST API，支持云端/手机直连模式。
            "default-src 'self'; script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: http: https:; "
            "connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def respond_json(
        self,
        status: HTTPStatus,
        payload: dict[str, object],
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def resolve_static_path(self, request_path: str) -> Path | None:
        normalized = posixpath.normpath(unquote(request_path))

        if normalized in {".", "/", "/composer", "/composer/"}:
            composer_index = REPO_ROOT / "composer" / "index.html"
            if composer_index.exists():
                return Path(self._resolve_repo_path(composer_index, REPO_ROOT))
            normalized = "/post-composer.html"

        if normalized.startswith("/composer/"):
            rel = normalized[len("/composer/"):]
            if not rel:
                rel = "index.html"
            target = REPO_ROOT / "composer" / rel
            if target.exists():
                return Path(self._resolve_repo_path(target, REPO_ROOT))

        if normalized.startswith("/assets/"):
            return Path(self._resolve_repo_path(REPO_ROOT / normalized.lstrip("/"), REPO_ROOT / "assets"))

        # Root static files (icons, manifest, sw)
        for cand_dir in [TOOLS_DIR, REPO_ROOT / "composer"]:
            cand = cand_dir / normalized.lstrip("/")
            if cand.exists() and cand.is_file():
                return Path(self._resolve_repo_path(cand, cand_dir))

        if normalized in {"/post-composer.html", "/post-composer.css", "/post-composer-app.js", "/post-composer-renderer.js", "/crypto-js.min.js"}:
            return Path(self._resolve_repo_path(TOOLS_DIR / normalized.lstrip("/"), TOOLS_DIR))

        return None

    def serve_static_file(self, target: Path) -> None:
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", self.static_content_type(target))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def _resolve_repo_path(target: Path, root: Path) -> str:
        resolved_target = target.resolve()
        resolved_root = root.resolve()
        try:
            common_path = os.path.commonpath([str(resolved_target), str(resolved_root)])
        except ValueError as error:
            raise PermissionError("invalid path") from error

        if common_path != str(resolved_root):
            raise PermissionError("invalid path")

        return str(resolved_target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--instance-id", default="")
    parser.add_argument("--manage-start", action="store_true")
    parser.add_argument("--manage-stop", action="store_true")
    parser.add_argument("--record-file", default="")
    parser.add_argument("--entry-point", default="post-composer")
    args = parser.parse_args()

    record_file = Path(args.record_file).resolve() if args.record_file else DEFAULT_RECORD_FILE
    if args.manage_start:
        raise SystemExit(manage_start(args.port, record_file, args.entry_point))
    if args.manage_stop:
        raise SystemExit(manage_stop(record_file))

    request_token = secrets.token_urlsafe(32)
    instance_id = args.instance_id or secrets.token_urlsafe(24)
    handler = partial(
        ComposerRequestHandler,
        directory=str(TOOLS_DIR),
        request_token=request_token,
        instance_id=instance_id,
        server_port=args.port,
    )
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Post Composer server is running at http://127.0.0.1:{args.port}/post-composer.html")
    print("Serving tools from", TOOLS_DIR)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
