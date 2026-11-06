/* Mi Tienda: integridad de ventas, cierre de caja y límite preventivo de almacenamiento.
   Compatible con las claves existentes de localStorage. No borra ni migra ventas antiguas. */
(function(){
'use strict';
const PENDING='sistemacobro_venta_pendiente_v1';
const LAST_ID='sistemacobro_ultimo_id_venta_v1';
const CLOSED='sistemacobro_cash_closed_v1';
const LIMIT=4*1024*1024; // estimación conservadora en bytes (UTF-16)
function tamano(){
  let bytes=0;
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    bytes+=2*(key.length+(localStorage.getItem(key)||'').length);
  }
  return bytes;
}
function estado(){return {bytes:tamano(),limite:LIMIT,superado:tamano()>=LIMIT};}
function fechaClave(d){const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function fechaVenta(v){if(v.fechaISO){const d=new Date(v.fechaISO);if(!Number.isNaN(d.getTime()))return d;}
  const m=String(v.fecha||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  const d=new Date(v.fecha);return Number.isNaN(d.getTime())?null:d;
}
function siguienteId(historial){
 const maxActual=(historial||[]).reduce((n,v)=>Math.max(n,Number(v.id)||0),0);
 const id=Math.max(Date.now(),(Number(localStorage.getItem(LAST_ID))||0)+1,maxActual+1);
 return id;
}
function guardarVenta({venta,productos,historial,historyKey,productsKey,cartKey}){
 if(localStorage.getItem(PENDING))throw new Error('Hay una venta pendiente de recuperación. Recarga la aplicación antes de cobrar.');
 const bytes=tamano();
 if(bytes>=LIMIT)throw new Error('El almacenamiento llegó al nivel de mantenimiento (4 MB). Guarda y borra el acumulado desde Modo Admin antes de registrar otra venta.');
 const histNuevo=JSON.stringify([venta,...historial]);
 const prodNuevo=JSON.stringify(productos);
 const actualH=localStorage.getItem(historyKey)||'[]';
 const actualP=localStorage.getItem(productsKey)||'[]';
 const proyeccion=bytes + 2*((histNuevo.length-actualH.length)+(prodNuevo.length-actualP.length));
 if(proyeccion>=LIMIT)throw new Error('Esta venta superaría el umbral preventivo de 4 MB. Es necesario respaldar y liberar historial antes de cobrar.');
 const cambios=productos.filter(p=>venta.items.some(it=>String(it.codigo)===String(p.codigo)))
  .map(p=>({codigo:p.codigo,stock:p.stock,stockGramos:p.stockGramos}));
 const pendiente={id:venta.id,historyKey,productsKey,cartKey,cambios};
 // Primero se prepara la transacción. Si falla, no se toca el historial ni el inventario.
 localStorage.setItem(PENDING,JSON.stringify(pendiente));
 try{
   // El historial es la fuente de verdad; el resto se recupera si el navegador se interrumpe.
   localStorage.setItem(historyKey,histNuevo);
   localStorage.setItem(productsKey,prodNuevo);
   localStorage.setItem(cartKey,'[]');
   localStorage.setItem(LAST_ID,String(venta.id));
   localStorage.removeItem(PENDING);
 }catch(e){
   // No reintentar automáticamente el cobro. La recuperación es idempotente tras recargar.
   throw new Error('Hubo un problema al guardar la venta. No vuelvas a cobrar todavía. Recarga la página para recuperar el estado y revisa el historial. Detalle: '+e.message);
 }
}
function recuperar({historyKey,productsKey,cartKey}){
 const raw=localStorage.getItem(PENDING);if(!raw)return;
 const p=JSON.parse(raw);
 if(p.historyKey!==historyKey||p.productsKey!==productsKey||p.cartKey!==cartKey)throw new Error('Existe una venta pendiente de otra configuración.');
 const ventas=JSON.parse(localStorage.getItem(historyKey)||'[]');
 const encontrada=ventas.some(v=>String(v.id)===String(p.id));
 if(encontrada){
   const prod=JSON.parse(localStorage.getItem(productsKey)||'[]');
   for(const cambio of p.cambios){
     const item=prod.find(x=>String(x.codigo)===String(cambio.codigo));
     if(item){if(cambio.stock!==undefined)item.stock=cambio.stock;
       if(cambio.stockGramos!==undefined)item.stockGramos=cambio.stockGramos;}
   }
   localStorage.setItem(productsKey,JSON.stringify(prod));
   localStorage.setItem(cartKey,'[]');
   localStorage.setItem(LAST_ID,String(Math.max(Number(localStorage.getItem(LAST_ID))||0,Number(p.id)||0)));
 }
 localStorage.removeItem(PENDING);
 if(encontrada)alert('Se recuperó una venta interrumpida. Verifica el último registro en Historial antes de continuar.');
}
function leerCierres(){try{const d=JSON.parse(localStorage.getItem(CLOSED)||'[]');return Array.isArray(d)?d:[];}catch(_){return [];}}
function efectivoCerradoHoy(historial,fecha=fechaClave(new Date())){
 const vigentes=new Set((historial||[]).map(v=>String(v.id)));
 return leerCierres().filter(c=>c.fecha===fecha).reduce((s,c)=>s+(c.ventas||[]).reduce((a,v)=>a+(vigentes.has(String(v.id))?0:(Number(v.efectivo)||0)),0),0);
}
function registrarCierreCaja(historial){
 const hoy=fechaClave(new Date());
 const ventas=(historial||[]).filter(v=>{
   const d=fechaVenta(v);return d&&fechaClave(d)===hoy;
 }).map(v=>({id:v.id,efectivo:v.metodoPago==='Tarjeta'?0:(Number(v.total)||0)}));
 if(!ventas.length)return;
 // Conserva los cierres del día anterior y hoy. Los periodos viejos no afectan caja actual.
 const ayer=fechaClave(new Date(Date.now()-86400000));
 const prev=leerCierres().filter(c=>c.fecha===hoy||c.fecha===ayer);
 prev.push({fecha:hoy,ventas});
 localStorage.setItem(CLOSED,JSON.stringify(prev));
}
window.MiTiendaIntegridad={estado,tamano,siguienteId,guardarVenta,recuperar,efectivoCerradoHoy,registrarCierreCaja};
})();
