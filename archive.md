---
layout: page
title: Archive
permalink: /archive/
description: A running list of posts published on the site.
kicker: Archive
page_class: archive-page
lang: en-US
hide_page_heading: true
---


{% if site.posts.size > 0 %}
<section class="archive-search-section">
  <label class="archive-search-field" for="archive-search">
    <input id="archive-search" type="search" placeholder="按标题或摘要搜索">
  </label>
</section>

<ul class="archive-list archive-timeline" data-local-post-list="archive">
  {% for post in site.posts %}
  <li class="archive-item" data-local-post-item data-post-file="{{ post.name | escape }}" data-search-text="{{ post.title | append: ' ' | append: post.excerpt | strip_html | downcase | escape }}">
    <span class="archive-date">{{ post.date | date: "%b %-d, %Y" }}</span>
    <div class="archive-entry">
      <div class="archive-entry-head">
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      </div>
      <p>{{ post.excerpt | strip_html | truncate: 170 }}</p>
    </div>
  </li>
  {% endfor %}
</ul>
<p class="empty-state archive-filter-empty" id="archive-filter-empty" hidden>没有匹配的文章。</p>
{% else %}
<p class="empty-state">No posts yet. Add a Markdown file to the _posts folder and it will appear here automatically.</p>
{% endif %}

<script>
  (function () {
    var searchInput = document.getElementById("archive-search");
    var archiveItems = Array.prototype.slice.call(document.querySelectorAll(".archive-item"));
    var emptyState = document.getElementById("archive-filter-empty");

    if (!searchInput || !archiveItems.length) {
      return;
    }

    function applySearch() {
      var query = searchInput.value.trim().toLowerCase();
      var visibleCount = 0;

      archiveItems.forEach(function (item) {
        var searchText = (item.getAttribute("data-search-text") || "").toLowerCase();
        var matches = !query || searchText.indexOf(query) !== -1;
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

    searchInput.addEventListener("input", applySearch);
    applySearch();
  })();
</script>
