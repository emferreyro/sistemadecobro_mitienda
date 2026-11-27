/* Mi Tienda: integridad de ventas, cierre de caja y límite preventivo de almacenamiento.
   Compatible con las claves existentes de localStorage. No borra ni migra ventas antiguas. */
(function(){
'use strict';
const PENDING='sistemacobro_venta_pendiente_v1';
const LAST_ID='sistemacobro_ultimo_id_venta_v1';
const CLOSED='sistemacobro_cash_closed_v1';
const LIMIT=4*1024*1024; // umbral de aviso, no bloqueo de ventas (estimación UTF-16)
function tamano(){
  let bytes=0;
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    bytes+=2*(key.length+(localStorage.getItem(key)||'').length);
  }
  return bytes;
}
function estado(){const bytes=tamano();return {bytes,limite:LIMIT,superado:bytes>=LIMIT};}
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
function guardarVenta({venta,productos,historial,historyKey,productsKey,cartKey,conservarCarrito=false}){
 if(localStorage.getItem(PENDING))throw new Error('Hay una venta pendiente de recuperación. Recarga la aplicación antes de cobrar.');
 // 4 MiB es un aviso de mantenimiento, NO una cuota real del navegador.
 // Permitir la venta mientras localStorage acepte las escrituras; si se agota la cuota,
 // el bloque try/catch inferior evita nuevos cobros y permite recuperar la transacción.
 if(JSON.stringify(historial)!==(localStorage.getItem(historyKey)||'[]'))throw Error('El historial cambió en otra ventana. Recarga antes de cobrar; no se guardó esta venta.');
 const histNuevo=JSON.stringify([venta,...historial]);
 const prodNuevo=JSON.stringify(productos);
 const cambios=productos.filter(p=>venta.items.some(it=>String(it.codigo)===String(p.codigo)))
  .map(p=>({codigo:p.codigo,stock:p.stock,stockGramos:p.stockGramos}));
 const pendiente={id:venta.id,historyKey,productsKey,cartKey,cambios,conservarCarrito};
 // Primero se prepara la transacción. Si falla, no se toca el historial ni el inventario.
 localStorage.setItem(PENDING,JSON.stringify(pendiente));
 try{
   // El historial es la fuente de verdad; el resto se recupera si el navegador se interrumpe.
   localStorage.setItem(historyKey,histNuevo);
   localStorage.setItem(productsKey,prodNuevo);
   if(!conservarCarrito)localStorage.setItem(cartKey,'[]');
   localStorage.setItem(LAST_ID,String(venta.id));
   localStorage.removeItem(PENDING);
 }catch(e){
   // No reintentar automáticamente el cobro. La recuperación es idempotente tras recargar.
   throw new Error('Hubo un problema real al guardar la venta (posible cuota de almacenamiento llena). No vuelvas a cobrar todavía. Recarga la página para recuperar el estado y revisa el historial antes de intentar otra venta. Detalle: '+e.message);
 }
}
function guardarPosventa({ventaId,movimientoId,productos,historial,historyKey,productsKey,cartKey,historyOriginal,productsOriginal}){
 if(localStorage.getItem(PENDING))throw Error('Hay una operación pendiente. Recarga antes de continuar.');
 if(localStorage.getItem(historyKey)!==historyOriginal||localStorage.getItem(productsKey)!==productsOriginal)throw Error('Los datos cambiaron. Recarga antes de continuar.');
 const anteriores=JSON.parse(productsOriginal||'[]');
 const mapa=new Map(anteriores.map(p=>[String(p.codigo),p]));
 const cambios=productos.filter(p=>{const a=mapa.get(String(p.codigo));return a&&(a.stock!==p.stock||a.stockGramos!==p.stockGramos);}).map(p=>({codigo:p.codigo,stock:p.stock,stockGramos:p.stockGramos}));
 const pendiente={id:ventaId,movimientoId,historyKey,productsKey,cartKey,cambios,conservarCarrito:true};
 const h=JSON.stringify(historial), p=JSON.stringify(productos);
 localStorage.setItem(PENDING,JSON.stringify(pendiente));
 try{
  localStorage.setItem(historyKey,h);
  localStorage.setItem(productsKey,p);
  if(localStorage.getItem(historyKey)!==h||localStorage.getItem(productsKey)!==p)throw Error('No coincide el guardado.');
  localStorage.removeItem(PENDING);
 }catch(e){throw Error('No repitas el movimiento. Recarga para recuperar la operación y verifica el inventario. '+e.message);}
 return {productos:JSON.parse(localStorage.getItem(productsKey)),historial:JSON.parse(localStorage.getItem(historyKey))};
}
function recuperar({historyKey,productsKey,cartKey}){
 const raw=localStorage.getItem(PENDING);if(!raw)return;
 const p=JSON.parse(raw);
 if(p.historyKey!==historyKey||p.productsKey!==productsKey||p.cartKey!==cartKey)throw new Error('Existe una venta pendiente de otra configuración.');
 const ventas=JSON.parse(localStorage.getItem(historyKey)||'[]');
 const encontrada=ventas.some(v=>String(v.id)===String(p.id)&&(!p.movimientoId||(v.posventa?.movimientos||[]).some(m=>m.id===p.movimientoId)));
 if(encontrada){
   const prod=JSON.parse(localStorage.getItem(productsKey)||'[]');
   for(const cambio of p.cambios){
     const item=prod.find(x=>String(x.codigo)===String(cambio.codigo));
     if(item){if(cambio.stock!==undefined)item.stock=cambio.stock;
       if(cambio.stockGramos!==undefined)item.stockGramos=cambio.stockGramos;}
   }
   localStorage.setItem(productsKey,JSON.stringify(prod));
   if(!p.conservarCarrito)localStorage.setItem(cartKey,'[]');
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
   if(v.metodoPago==='Consumo interno')return false;
   const d=fechaVenta(v);return d&&fechaClave(d)===hoy;
 }).map(v=>({id:v.id,efectivo:Array.isArray(v.pagos)&&v.pagos.length
   ? v.pagos.filter(x=>x.metodo==='Efectivo').reduce((sum,x)=>sum+(Number(x.importe)||0),0)
   : (v.metodoPago==='Tarjeta'||v.metodoPago==='Vales'||v.metodoPago==='Vale'?0:(Number(v.total)||0))}));
 if(!ventas.length)return;
 // Conserva los cierres del día anterior y hoy. Los periodos viejos no afectan caja actual.
 const ayer=fechaClave(new Date(Date.now()-86400000));
 const prev=leerCierres().filter(c=>c.fecha===hoy||c.fecha===ayer);
 prev.push({fecha:hoy,ventas});
 localStorage.setItem(CLOSED,JSON.stringify(prev));
}

/* Cierres operativos compartidos. No modifica ventas ni existencias. */
const TURN='sistemacobro_turnos_v2', START='sistemacobro_cash_start_v1';
const zero=()=>({Efectivo:0,Tarjeta:0,Vales:0});
const round=n=>Math.round(n*100)/100;
function state(){const raw=localStorage.getItem(TURN);return raw?JSON.parse(raw):{date:'',turn:zero(),day:zero(),records:[]};}
function daily(hist,net,now=new Date()){
 const date=fechaClave(now), sums=zero();
 for(const v of hist){const d=fechaVenta(v);if(!d||fechaClave(d)!==date||v.metodoPago==='Consumo interno')continue;
 const a=net(v);for(const k of Object.keys(sums))sums[k]+=Number(a[k])||0;}
 sums.Efectivo+=efectivoCerradoHoy(hist,date);return sums;
}
function totals(hist,net,now=new Date()){
 const actual=daily(hist,net,now), s=state(), same=s.date===fechaClave(now);
 const delta=base=>Object.fromEntries(Object.keys(actual).map(k=>[k,round(actual[k]-(same?(Number(base?.[k])||0):0))]));
 return {turn:delta(s.turn),day:delta(s.day),actual};
}
function fondo(original){const s=state();return s.date===fechaClave(new Date())?Number(s.start)||0:original;}
function setFondo(amount){const s=state();if(s.date!==fechaClave(new Date()))return false;s.start=amount;localStorage.setItem(TURN,JSON.stringify(s));return true;}
function closeShift({hist,net,start,type,counted,operator,note,historyKey}){
 if(localStorage.getItem(PENDING))throw Error('Hay una venta pendiente. Recarga antes de cerrar.');
 if(JSON.stringify(hist)!==(localStorage.getItem(historyKey)||'[]'))throw Error('El historial cambió. Recarga antes de cerrar.');
 const now=new Date(), date=fechaClave(now), s=state(), t=totals(hist,net,now);
 const same=s.date===date, expected=round(start+t.turn.Efectivo);
 const record={id:now.toISOString(),tipo:type,fecha:date,at:now.toISOString(),cajero:operator,observaciones:note,fondo:start,ventas:t.turn,esperado:expected,contado:counted,diferencia:round(counted-expected),acumuladoDia:t.day};
 const next={date,turn:t.actual,day:type==='dia'?t.actual:(same?s.day:zero()),start:0,records:[...(s.records||[]),record]};
 localStorage.setItem(TURN,JSON.stringify(next));return record;
}
function source(){const key='mitienda_origen_cierres_v1';let id=localStorage.getItem(key);if(!id){id=globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random();localStorage.setItem(key,id);}return id;}
function expandirVentas(ventas){
 const result=[];
 for(const v of ventas){result.push(v);if(v.metodoPago==='Consumo interno')continue;
 for(const m of v.posventa?.movimientos||[]){if(m.tipo==='consumo_interno')continue;
 const items=[...(m.devueltos||[]).map(r=>({...((v.items||[])[Number(r.indice)]||{}),codigo:r.codigo,nombre:r.nombre,cantidad:-Number(r.cantidad),precio:r.precio,subtotal:-Number(r.importe)})),...(m.entregados||[])];
 result.push({id:m.id||String(v.id)+':'+m.fechaISO,fecha:m.fecha,fechaISO:m.fechaISO,total:Number(m.total)||0,subtotalProductos:items.reduce((a,i)=>a+(Number(i.subtotal)||0),0),metodoPago:m.metodoPago,items,movimiento:{...m,origen:v.id}});
 }}return result;
}
function guardarResumenMes(ventas,net,mes){const key='mitienda_resumen_meses_v1', data=JSON.parse(localStorage.getItem(key)||'{}'), days={};for(const v of ventas){const d=fechaVenta(v);if(!d)continue;const k=fechaClave(d);days[k]=(days[k]||0)+(v.metodoPago==='Consumo interno'?0:Object.values(net(v)).reduce((a,b)=>a+b,0));}data[mes]=days;localStorage.setItem(key,JSON.stringify(data));}
function period(v){const d=fechaVenta(v);return d?fechaClave(d).slice(0,7):null;}
function weekTotal(hist,net,now=new Date()){
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-((start.getDay()+6)%7));
 const active=new Set(hist.map(period));const archived=JSON.parse(localStorage.getItem('mitienda_resumen_meses_v1')||'{}');let extra=0;for(const [month,days] of Object.entries(archived)){if(active.has(month))continue;for(const [day,total] of Object.entries(days))if(day>=fechaClave(start)&&day<=fechaClave(now))extra+=Number(total)||0;}return round(extra+hist.reduce((s,v)=>{const d=fechaVenta(v);return d&&d>=start&&d<=now&&v.metodoPago!=='Consumo interno'?s+Object.values(net(v)).reduce((a,b)=>a+b,0):s;},0));
}
window.MiTiendaIntegridad={source,expandirVentas,guardarResumenMes,totals,fondo,setFondo,closeShift,period,weekTotal,estado,tamano,siguienteId,guardarVenta,guardarPosventa,recuperar,efectivoCerradoHoy,registrarCierreCaja};
})();
