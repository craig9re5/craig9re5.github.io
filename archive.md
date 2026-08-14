---
layout: page
title: Archive
permalink: /archive/
description: A running list of posts published on the site.
kicker: Archive
page_class: archive-page
lang: en
---

{% if site.posts.size > 0 %}
{% assign all_tags = "" | split: "" %}
{% for post in site.posts %}
  {% if post.tags %}
    {% for tag in post.tags %}
      {% assign all_tags = all_tags | push: tag %}
    {% endfor %}
  {% endif %}
{% endfor %}
{% assign unique_tags = all_tags | uniq | sort %}

<section class="archive-search-section">
  <label class="archive-search-field" for="archive-search">
    <span class="archive-search-label">Search by title or excerpt</span>
    <input id="archive-search" type="search" placeholder="Search by title or excerpt...">
  </label>

  {% if unique_tags.size > 0 %}
  <div class="archive-tags-filter" role="toolbar" aria-label="Filter posts by tag">
    <span class="archive-tags-label">Tags:</span>
    <div class="archive-tags-pills">
      <button type="button" class="archive-tag-btn is-active" data-tag-filter="all">All <span class="tag-count">({{ site.posts.size }})</span></button>
      {% for tag in unique_tags %}
        {% assign tag_count = 0 %}
        {% for post in site.posts %}
          {% if post.tags contains tag %}
            {% assign tag_count = tag_count | plus: 1 %}
          {% endif %}
        {% endfor %}
        <button type="button" class="archive-tag-btn" data-tag-filter="{{ tag | escape }}">{{ tag }} <span class="tag-count">({{ tag_count }})</span></button>
      {% endfor %}
    </div>
  </div>
  {% endif %}
</section>

<ul class="archive-list archive-timeline" data-local-post-list="archive">
  {% for post in site.posts %}
  <li class="archive-item" data-local-post-item data-post-file="{{ post.name | escape }}" data-search-text="{{ post.title | append: ' ' | append: post.excerpt | strip_html | downcase | escape }}" data-post-tags="{% if post.tags %}{{ post.tags | join: ',' | downcase | escape }}{% endif %}">
    <span class="archive-date">{{ post.date | date: "%b %-d, %Y" }}</span>
    <div class="archive-entry">
      <div class="archive-entry-head">
        <a href="{{ post.url | relative_url }}" lang="{{ post.lang | default: 'en' }}">{{ post.title }}</a>
      </div>
      {% assign archive_excerpt = post.excerpt | strip_html | strip %}
      {% if archive_excerpt != "" %}
      <p lang="{{ post.lang | default: 'en' }}">{{ archive_excerpt | truncate: 170 }}</p>
      {% endif %}
      {% if post.tags and post.tags.size > 0 %}
      <div class="archive-entry-tags">
        {% for tag in post.tags %}
        <span class="post-tag-chip post-tag-chip-sm">{{ tag }}</span>
        {% endfor %}
      </div>
      {% endif %}
    </div>
  </li>
  {% endfor %}
</ul>
<p class="empty-state archive-filter-empty" id="archive-filter-empty" hidden>No posts match that search.</p>
{% else %}
<p class="empty-state">No posts yet. Add a Markdown file to the _posts folder and it will appear here automatically.</p>
{% endif %}

<script>
  (function () {
    var searchInput = document.getElementById("archive-search");
    var archiveItems = Array.prototype.slice.call(document.querySelectorAll(".archive-item"));
    var emptyState = document.getElementById("archive-filter-empty");
    var tagButtons = Array.prototype.slice.call(document.querySelectorAll(".archive-tag-btn"));
    var currentSelectedTag = "all";

    if (!archiveItems.length) {
      return;
    }

    function applyFilter() {
      var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
      var selectedTagLower = currentSelectedTag.toLowerCase();
      var visibleCount = 0;

      archiveItems.forEach(function (item) {
        var searchText = (item.getAttribute("data-search-text") || "").toLowerCase();
        var postTags = (item.getAttribute("data-post-tags") || "").toLowerCase().split(",");
        
        var matchesText = !query || searchText.indexOf(query) !== -1;
        var matchesTag = (selectedTagLower === "all") || (postTags.indexOf(selectedTagLower) !== -1);

        var matches = matchesText && matchesTag;
        item.hidden = !matches;
        item.classList.toggle("is-filtered-out", !matches);
        if (matches) {
          visibleCount += 1;
        }
      });

      if (emptyState) {
        emptyState.hidden = visibleCount !== 0;
      }
    }

    function selectTag(tagName, updateUrl) {
      currentSelectedTag = tagName || "all";
      tagButtons.forEach(function (btn) {
        var btnTag = btn.getAttribute("data-tag-filter");
        var isActive = btnTag.toLowerCase() === currentSelectedTag.toLowerCase();
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", String(isActive));
      });

      if (updateUrl && window.history && window.history.replaceState) {
        var url = new URL(window.location);
        if (currentSelectedTag === "all") {
          url.searchParams.delete("tag");
        } else {
          url.searchParams.set("tag", currentSelectedTag);
        }
        window.history.replaceState({}, "", url);
      }

      applyFilter();
    }

    tagButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetTag = btn.getAttribute("data-tag-filter");
        selectTag(targetTag, true);
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", applyFilter);
    }

    // Initialize from URL params if present
    try {
      var params = new URLSearchParams(window.location.search);
      var tagParam = params.get("tag");
      if (tagParam) {
        selectTag(tagParam, false);
      } else {
        applyFilter();
      }
    } catch (e) {
      applyFilter();
    }
  })();
</script>
