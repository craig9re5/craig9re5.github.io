---
layout: page
title: Archive
permalink: /archive/
page_class: archive-page
lang: en-US
hide_page_heading: true
---

{% if site.posts.size > 0 %}
<div class="archive-search-wrap">
  <div class="archive-search-input-box">
    <svg class="archive-search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
    </svg>
    <input id="archive-search" type="search" placeholder="Search posts..." aria-label="Search posts">
  </div>
</div>

<ul class="archive-list archive-timeline" data-local-post-list="archive">
  {% for post in site.posts %}
  <li class="archive-item" data-local-post-item data-post-file="{{ post.name | escape }}" data-search-text="{{ post.title | append: ' ' | append: post.excerpt | strip_html | downcase | escape }}">
    <time class="archive-date" datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%b %-d, %Y" }}</time>
    <div class="archive-entry">
      <div class="archive-entry-head">
        <a href="{{ post.url | relative_url }}" lang="{{ post.lang | default: 'en' }}">{{ post.title }}</a>
      </div>
      {% assign archive_excerpt = post.excerpt | strip_html | strip %}
      {% if archive_excerpt != "" %}
      <p lang="{{ post.lang | default: 'en' }}">{{ archive_excerpt | truncate: 170 }}</p>
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

    if (!archiveItems.length || !searchInput) {
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
