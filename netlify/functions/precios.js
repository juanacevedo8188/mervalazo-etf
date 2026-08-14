exports.handler = async function(event, context) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  async function fetchJSON(url) {
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, 6000);
    try {
      var res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return await res.json();
    } catch(e) {
      clearTimeout(timeout);
      return null;
    }
  }

  try {
    var results = await Promise.all([
      fetchJSON("https://dolarapi.com/v1/dolares"),
      fetchJSON("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo"),
      fetchJSON("https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimos"),
      fetchJSON("https://api.argentinadatos.com/v1/finanzas/indices/merval/ultimo"),
    ]);

    var dolarArr = results[0];
    var rpData   = results[1];
    var mmData   = results[2];
    var mervalData = results[3];

    // Dólar
    var dolares = {};
    if (dolarArr && Array.isArray(dolarArr)) {
      dolarArr.forEach(function(d){ dolares[d.casa] = { compra: d.compra, venta: d.venta, nombre: d.nombre }; });
    }
    var ccl = dolares.ccl ? dolares.ccl.venta : 1200;

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

    // Merval
    var merval = mervalData ? { valor: mervalData.valor, variacion: mervalData.variacion || 0 } : null;

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        dolares: dolares,
        ccl: ccl,
        riesgoPais: riesgoPais,
        tnaMM: tnaMM,
        merval: merval,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
