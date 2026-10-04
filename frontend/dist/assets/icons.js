/* icons.js — Replace Material Icons Round ligature spans with inline SVGs */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("span.material-icons-round").forEach(function (el) {
    var name = (el.textContent || "").trim();
    if (!name) return;

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "assets/icons.svg#icon-" + name);
    svg.appendChild(use);

    if (el.style.cssText) svg.style.cssText = el.style.cssText;
    el.parentNode.replaceChild(svg, el);
  });
});
