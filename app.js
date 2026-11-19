(function () {
  "use strict";

  var CATS = ["Sangat Rendah", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"];
  var SHORT = ["S. Rendah", "Rendah", "Sedang", "Tinggi", "S. Tinggi"];
  var COLORS = { "Sangat Rendah": "#cde2fb", "Rendah": "#86b6ef", "Sedang": "#3987e5", "Tinggi": "#1c5cab", "Sangat Tinggi": "#0d366b" };
  var NODATA = "#e4e3dc", INK = "#1f1f1e";

  var D, kabById = {}, provById = {}, kabByProv = {};
  var state = { level: "kab", sel: null };
  var map, kabLayer, provLayer, provLines, layerById = {}, provLayerById = {};

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (x) { return x.toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 }); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var norm = function (s) { return s.toLowerCase().replace(/^(kab\.|kabupaten|kota|provinsi)\s+/, "").replace(/[^a-z0-9]/g, ""); };

  Promise.all([
    fetch("data/kapasitas_fiskal_2025.json").then(function (r) { return r.json(); }),
    fetch("data/kabkota.geo.json").then(function (r) { return r.json(); }),
    fetch("data/provinsi.geo.json").then(function (r) { return r.json(); })
  ]).then(function (res) { init(res[0], res[1], res[2]); })
    .catch(function (e) { $("card").innerHTML = '<p class="hint">Data gagal dimuat. Muat ulang halaman. (' + esc(e.message) + ")</p>"; });

  function init(data, kabGeo, provGeo) {
    D = data;
    D.provinsi.forEach(function (p) { provById[p.id] = p; kabByProv[p.id] = []; });
    D.kabkota.forEach(function (k) { kabById[k.id] = k; kabByProv[k.prov].push(k); });
    Object.keys(kabByProv).forEach(function (p) { kabByProv[p].sort(function (a, b) { return b.rasio - a.rasio; }); });

    // static text
    $("src-link").href = D.meta.url;
    $("koreksi").textContent = D.meta.koreksi_provinsi.map(function (r) { return r[0] + " (" + r[2] + ", sebelumnya tercatat " + r[1] + ")"; }).join("; ");

    // province select
    var provs = D.provinsi.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); });
    provs.forEach(function (p) { $("sel-prov").add(new Option(p.nama, p.id)); });
    fillKabSelect("");

    // map
    map = L.map("map", { zoomSnap: 0.25, minZoom: 4, maxZoom: 11, attributionControl: true, zoomControl: true })
      .fitBounds([[-11, 95], [6.2, 141]]);
    map.attributionControl.setPrefix(false).addAttribution('Batas: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a> · Data: PMK 97/2025');

    kabLayer = L.geoJSON(kabGeo, {
      style: kabStyle,
      onEachFeature: function (f, layer) {
        layerById[f.properties.id] = layer;
        layer.bindTooltip(function () { return tipHtml(f.properties); }, { sticky: true, className: "tt", direction: "top", offset: [0, -6] });
        layer.on({
          mouseover: function () { if (state.sel !== f.properties.id) layer.setStyle({ weight: 1.6, color: INK }); },
          mouseout: function () { kabLayer.resetStyle(layer); applySelStyle(); },
          click: function () {
            var id = f.properties.id;
            select(kabById[id] ? id : f.properties.prov, { fly: false });
          }
        });
      }
    });
    provLayer = L.geoJSON(provGeo, {
      style: provStyle,
      onEachFeature: function (f, layer) {
        provLayerById[f.properties.prov] = layer;
        layer.bindTooltip(function () { return tipHtml({ prov: f.properties.prov, id: f.properties.prov }); }, { sticky: true, className: "tt", direction: "top", offset: [0, -6] });
        layer.on({
          mouseover: function () { if (state.sel !== f.properties.prov) layer.setStyle({ weight: 2, color: INK }); },
          mouseout: function () { provLayer.resetStyle(layer); applySelStyle(); },
          click: function () { select(f.properties.prov, { fly: false }); }
        });
      }
    });
    provLines = L.geoJSON(provGeo, { interactive: false, style: { fill: false, color: "#4a4a46", weight: 0.9, opacity: 0.6 } });

    // events
    $("tab-kab").onclick = function () { setLevel("kab"); };
    $("tab-prov").onclick = function () { setLevel("prov"); };
    $("sel-prov").onchange = function () { select(this.value || null); };
    $("sel-kab").onchange = function () { select(this.value || $("sel-prov").value || null); };
    setupSearch();
    window.addEventListener("hashchange", fromHash);

    setLevel("kab", true);
    fromHash();
  }

  // ---------- styles ----------
  function kabStyle(f) {
    var k = kabById[f.properties.id];
    return { fillColor: k ? COLORS[k.kategori] : NODATA, fillOpacity: 1, color: "#ffffff", weight: 0.4, opacity: 1 };
  }
  function provStyle(f) {
    var p = provById[f.properties.prov];
    return { fillColor: p ? COLORS[p.kategori] : NODATA, fillOpacity: 1, color: "#ffffff", weight: 0.8, opacity: 1 };
  }
  var selLayers = [];
  function applySelStyle() {
    selLayers.forEach(function (l) { l.setStyle({ color: INK, weight: 2.6, opacity: 1 }); l.bringToFront(); });
  }
  function clearSelStyle() {
    selLayers.forEach(function (l) {
      if (kabLayer.hasLayer(l)) kabLayer.resetStyle(l); else if (provLayer.hasLayer(l)) provLayer.resetStyle(l);
    });
    selLayers = [];
  }

  function tipHtml(props) {
    var k = kabById[props.id];
    if (state.level === "kab" && k) return "<b>" + esc(k.nama) + "</b>" + fmt(k.rasio) + " · " + esc(k.kategori);
    var p = provById[props.prov];
    if (state.level === "kab") return "<b>" + esc(p.nama) + "</b>Hanya dinilai di tingkat provinsi";
    return "<b>Provinsi " + esc(p.nama) + "</b>" + fmt(p.rasio) + " · " + esc(p.kategori);
  }

  // ---------- level ----------
  function setLevel(level, silent) {
    state.level = level;
    $("tab-kab").setAttribute("aria-selected", level === "kab");
    $("tab-prov").setAttribute("aria-selected", level === "prov");
    $("field-kab").hidden = level !== "kab";
    clearSelStyle();
    if (level === "kab") { map.removeLayer(provLayer); kabLayer.addTo(map); provLines.addTo(map); }
    else { map.removeLayer(kabLayer); map.removeLayer(provLines); provLayer.addTo(map); }
    renderLegend();
    if (!silent) {
      var s = state.sel;
      if (level === "prov" && s && kabById[s]) s = kabById[s].prov;
      select(s, { fly: false });
    }
  }

  function renderLegend() {
    var rg = state.level === "kab" ? D.meta.rentang_kabkota : D.meta.rentang_provinsi;
    var html = "<h4>" + (state.level === "kab" ? "Kategori kabupaten/kota" : "Kategori provinsi") + "</h4>";
    CATS.slice().reverse().forEach(function (c) {
      var r = rg[c];
      html += '<div class="row"><span class="sw" style="background:' + COLORS[c] + '"></span><span>' + c + " (" + r[2] + ')</span><span class="rg">' + fmt(r[0]) + "–" + fmt(r[1]) + "</span></div>";
    });
    if (state.level === "kab") html += '<div class="row"><span class="sw" style="background:' + NODATA + '"></span><span>DKI Jakarta (tingkat provinsi)</span><span></span></div>';
    $("legend").innerHTML = html;
  }

  // ---------- selection ----------
  function select(id, opt) {
    opt = opt || {};
    if (id && !kabById[id] && !provById[id]) id = null;
    if (id && kabById[id] && state.level === "prov") setLevel("kab", true);
    state.sel = id;
    if (location.hash.slice(1) !== (id || "")) history.replaceState(null, "", id ? "#" + id : location.pathname + location.search);

    var k = id && kabById[id], p = id && (k ? provById[k.prov] : provById[id]);
    $("sel-prov").value = p ? p.id : "";
    fillKabSelect(p ? p.id : "");
    $("sel-kab").value = k ? k.id : "";

    clearSelStyle();
    var target = null;
    if (k) { target = layerById[k.id]; selLayers = [target]; }
    else if (p) {
      if (state.level === "prov") { target = provLayerById[p.id]; selLayers = [target]; }
      else {
        selLayers = [];
        target = provLayerById[p.id];
        // outline the province's kab/kota polygons
        Object.keys(layerById).forEach(function (lid) {
          var f = layerById[lid].feature; if (f.properties.prov === p.id) selLayers.push(layerById[lid]);
        });
      }
    }
    if (state.level === "kab" && p && !k) {
      selLayers.forEach(function (l) { l.setStyle({ color: INK, weight: 1.1, opacity: 1 }); });
      provLines.bringToFront();
    } else applySelStyle();

    if (target && opt.fly !== false) map.flyToBounds(target.getBounds(), { padding: [30, 30], maxZoom: k ? 9 : 7, duration: 0.6 });
    else if (target && !map.getBounds().contains(target.getBounds())) map.fitBounds(target.getBounds(), { padding: [30, 30], maxZoom: k ? 9 : 7 });
    if (!id) map.flyToBounds([[-11, 95], [6.2, 141]], { duration: 0.6 });

    renderCard(k, p);
    renderList(k, p);
  }

  function fillKabSelect(provId) {
    var s = $("sel-kab"); s.length = 1;
    var list = provId ? kabByProv[provId].slice() : D.kabkota.slice();
    list.sort(function (a, b) { return a.nama.replace(/^(Kab\.|Kota) /, "").localeCompare(b.nama.replace(/^(Kab\.|Kota) /, ""), "id"); });
    list.forEach(function (k) { s.add(new Option(k.nama + (provId ? "" : " — " + provById[k.prov].nama), k.id)); });
    s.options[0].text = provId && !kabByProv[provId].length ? "Tidak ada kabupaten/kota" : "Pilih kabupaten/kota…";
  }

  function scaleHtml(val, kat, rg) {
    var i = CATS.indexOf(kat), r = rg[kat];
    var t = r[1] > r[0] ? (val - r[0]) / (r[1] - r[0]) : 0.5;
    var pos = (i + Math.max(0, Math.min(1, t))) / 5 * 100;
    var bar = CATS.map(function (c) { return '<span style="background:' + COLORS[c] + '"></span>'; }).join("");
    return '<div class="scale" aria-hidden="true"><div class="bar">' + bar + '<i class="marker" style="left:' + pos.toFixed(1) + '%"></i></div><div class="ticks">' +
      SHORT.map(function (s) { return "<span>" + s + "</span>"; }).join("") + "</div></div>";
  }

  function renderCard(k, p) {
    var c = $("card");
    if (!p) { c.className = "card empty"; c.innerHTML = '<p class="hint">Pilih daerah dari daftar, ketik namanya, atau klik langsung di peta.</p>'; return; }
    c.className = "card";
    if (k) {
      c.innerHTML = '<p class="level">' + (k.nama.indexOf("Kota") === 0 ? "Kota" : "Kabupaten") + '</p><h2>' + esc(k.nama) + "</h2>" +
        '<p class="parent">Provinsi <a data-go="' + p.id + '">' + esc(p.nama) + "</a></p>" +
        '<div class="big"><span class="num">' + fmt(k.rasio) + '</span><span class="lbl">rasio kapasitas<br>fiskal daerah</span></div>' +
        '<div class="chip"><span class="sw" style="background:' + COLORS[k.kategori] + '"></span>Kategori ' + esc(k.kategori) + "</div>" +
        scaleHtml(k.rasio, k.kategori, D.meta.rentang_kabkota) +
        '<div class="stats"><div class="stat"><b>' + k.rank_prov + " <small>dari " + k.n_prov + '</small></b><span>Peringkat di provinsi</span></div>' +
        '<div class="stat"><b>' + k.rank + " <small>dari " + D.kabkota.length + '</small></b><span>Peringkat nasional kab/kota</span></div></div>';
    } else {
      var n = kabByProv[p.id].length;
      c.innerHTML = '<p class="level">Provinsi</p><h2>' + esc(p.nama) + "</h2>" +
        '<p class="parent">' + (n ? n + " kabupaten/kota" : "Tanpa kabupaten/kota otonom") + "</p>" +
        '<div class="big"><span class="num">' + fmt(p.rasio) + '</span><span class="lbl">rasio kapasitas<br>fiskal daerah</span></div>' +
        '<div class="chip"><span class="sw" style="background:' + COLORS[p.kategori] + '"></span>Kategori ' + esc(p.kategori) + "</div>" +
        scaleHtml(p.rasio, p.kategori, D.meta.rentang_provinsi) +
        '<div class="stats"><div class="stat"><b>' + p.rank + ' <small>dari 38</small></b><span>Peringkat nasional provinsi</span></div>' +
        '<div class="stat"><b>' + catCount(p.id) + '</b><span>Kab/kota kategori Tinggi atau Sangat Tinggi</span></div></div>';
    }
    var a = c.querySelector("[data-go]");
    if (a) { a.href = "#" + a.getAttribute("data-go"); a.onclick = function (e) { e.preventDefault(); select(this.getAttribute("data-go")); }; }
  }
  function catCount(pid) {
    var l = kabByProv[pid]; if (!l.length) return "–";
    return l.filter(function (k) { return k.kategori === "Tinggi" || k.kategori === "Sangat Tinggi"; }).length + " <small>dari " + l.length + "</small>";
  }

  function renderList(k, p) {
    var wrap = $("list-wrap"), ol = $("list"), items, title;
    if (p && kabByProv[p.id].length) { items = kabByProv[p.id]; title = "Kabupaten/kota di " + p.nama + ", urut rasio"; }
    else if (!p && state.level === "prov") { items = D.provinsi.slice().sort(function (a, b) { return b.rasio - a.rasio; }); title = "Peringkat 38 provinsi"; }
    else { wrap.hidden = true; return; }
    wrap.hidden = false; $("list-title").textContent = title;
    var max = items[0].rasio || 1;
    ol.innerHTML = items.map(function (it, i) {
      var on = (k && it.id === k.id) ? " on" : "";
      return '<li class="' + on + '" data-id="' + it.id + '"><span class="r">' + (it.rank_prov || it.rank) + '</span><span class="n"><em>' + esc(it.nama) +
        '</em><i class="b" style="width:' + Math.max(1, it.rasio / max * 100).toFixed(1) + "%;background:" + COLORS[it.kategori] + '"></i></span><span class="v">' + fmt(it.rasio) + "</span></li>";
    }).join("");
    Array.prototype.forEach.call(ol.children, function (li) { li.onclick = function () { select(li.getAttribute("data-id")); }; });
    var on = ol.querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest" });
  }

  // ---------- search ----------
  function setupSearch() {
    var q = $("q"), ul = $("q-list"), idx = -1, res = [];
    var all = D.provinsi.map(function (p) { return { id: p.id, nama: p.nama, sub: "Provinsi", key: norm(p.nama) }; })
      .concat(D.kabkota.map(function (k) { return { id: k.id, nama: k.nama, sub: provById[k.prov].nama, key: norm(k.nama) }; }));
    function draw() {
      ul.innerHTML = res.map(function (r, i) { return '<li role="option" data-id="' + r.id + '" aria-selected="' + (i === idx) + '">' + esc(r.nama) + "<small>" + esc(r.sub) + "</small></li>"; }).join("");
      ul.hidden = !res.length;
      Array.prototype.forEach.call(ul.children, function (li) { li.onmousedown = function (e) { e.preventDefault(); pick(li.getAttribute("data-id")); }; });
    }
    function pick(id) { q.value = ""; res = []; idx = -1; draw(); select(id); }
    q.oninput = function () {
      var t = norm(q.value); idx = -1;
      if (!t) { res = []; draw(); return; }
      res = all.filter(function (a) { return a.key.indexOf(t) !== -1; })
        .sort(function (a, b) { return (a.key.indexOf(t) - b.key.indexOf(t)) || a.key.length - b.key.length; }).slice(0, 12);
      draw();
    };
    q.onkeydown = function (e) {
      if (e.key === "ArrowDown") { idx = Math.min(res.length - 1, idx + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter" && res.length) { pick(res[Math.max(0, idx)].id); e.preventDefault(); }
      else if (e.key === "Escape") { res = []; draw(); }
    };
    q.onblur = function () { setTimeout(function () { res = []; draw(); }, 100); };
  }

  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (id === "tentang") return;
    if (id && provById[id] && !kabById[id] && state.level === "kab") { select(id); return; }
    if (id !== (state.sel || "")) select(id || null);
  }
})();
