exports.handler = async function(event, context) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  async function fetchJSON(url, extraHeaders) {
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, 7000);
    try {
      var opts = { signal: controller.signal, headers: extraHeaders || {} };
      var res = await fetch(url, opts);
      clearTimeout(timeout);
      if (!res.ok) return null;
      return await res.json();
    } catch(e) {
      clearTimeout(timeout);
      return null;
    }
  }

  // ── YAHOO FINANCE — precios acciones y CEDEARs ────────────────────────────
  // Tickers: .BA para acciones BYMA, sin sufijo para NYSE (CEDEARs base)
  var tickers = [
    // Acciones BYMA
    { id:"YPFD",  yf:"YPFD.BA",  tipo:"accion" },
    { id:"PAMP",  yf:"PAMP.BA",  tipo:"accion" },
    { id:"TGSU2", yf:"TGSU2.BA", tipo:"accion" },
    { id:"VIST",  yf:"VIST.BA",  tipo:"accion" },
    // CEDEARs — precio en ARS desde Yahoo
    { id:"FCX",   yf:"FCX.BA",   tipo:"cedear" },
    { id:"VALE",  yf:"VALE.BA",  tipo:"cedear" },
    { id:"SLB",   yf:"SLB.BA",   tipo:"cedear" },
    // Merval
    { id:"MERVAL", yf:"^MERV",   tipo:"indice" },
  ];

  var symbols = tickers.map(function(t){ return t.yf; }).join(",");
  var yfUrl = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + symbols + "&lang=es-AR&region=AR";

  var precios = {};
  var mervalData = null;

  var yfData = await fetchJSON(yfUrl, {
    "User-Agent": "Mozilla/5.0 (compatible; Netlify Function)",
    "Accept": "application/json",
  });

  if (yfData && yfData.quoteResponse && yfData.quoteResponse.result) {
    yfData.quoteResponse.result.forEach(function(q) {
      var ticker = tickers.find(function(t){ return t.yf === q.symbol; });
      if (!ticker) return;

      if (ticker.tipo === "indice") {
        mervalData = {
          valor: q.regularMarketPrice,
          variacion: q.regularMarketChangePercent,
        };
      } else {
        precios[ticker.id] = {
          actual: q.regularMarketPrice,
          varDia: q.regularMarketChangePercent,
          nombre: q.longName || q.shortName || ticker.id,
        };
      }
    });
  }

  // ── APIs ARGENTINAS — dólar, riesgo país, FCI ─────────────────────────────
  var results = await Promise.all([
    fetchJSON("https://dolarapi.com/v1/dolares"),
    fetchJSON("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo"),
    fetchJSON("https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimos"),
  ]);

  var dolarArr   = results[0];
  var rpData     = results[1];
  var mmData     = results[2];

  // Dólar
  var dolares = {};
  if (dolarArr && Array.isArray(dolarArr)) {
    dolarArr.forEach(function(d){ dolares[d.casa] = { compra: d.compra, venta: d.venta, nombre: d.nombre }; });
  }
  var ccl = dolares.ccl ? dolares.ccl.venta : null;

  // Riesgo país
  var riesgoPais = rpData ? rpData.valor : null;

  // Money market — mejor TNA
  var tnaMM = 0.28;
  if (mmData && Array.isArray(mmData)) {
    var fondosMap = {};
    mmData.forEach(function(f){
      if (!fondosMap[f.fondo] || fondosMap[f.fondo].fecha < f.fecha) fondosMap[f.fondo] = f;
    });
    var top = Object.values(fondosMap).sort(function(a,b){ return (b.tna||0)-(a.tna||0); })[0];
    if (top && top.tna) tnaMM = top.tna;
  }

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      precios:    precios,
      dolares:    dolares,
      ccl:        ccl,
      riesgoPais: riesgoPais,
      tnaMM:      tnaMM,
      merval:     mervalData,
      timestamp:  new Date().toISOString(),
    }),
  };
};
