import { normalize } from './search'

// Emoji for categories, goals and fixed expenses, grouped, each with
// Spanish search words. Curated for money things rather than the full
// Unicode set, so the picker stays quick to scan.
export const EMOJI_GROUPS = [
  { title: 'Casa y facturas', items: [
    ['🏠', 'casa hogar vivienda alquiler hipoteca'], ['🏡', 'casa jardin chalet'], ['🔑', 'llave alquiler piso'],
    ['💡', 'luz electricidad factura'], ['🔥', 'gas calefaccion'], ['💧', 'agua factura'], ['📶', 'internet wifi fibra'],
    ['📱', 'movil telefono'], ['🧹', 'limpieza hogar'], ['🛋️', 'muebles sofa decoracion'], ['🧺', 'lavanderia colada'],
    ['🔧', 'reparaciones arreglos'], ['🪴', 'plantas jardin'], ['🧾', 'factura recibo impuestos'], ['🏛️', 'impuestos hacienda ibi'],
  ] },
  { title: 'Comida', items: [
    ['🛒', 'supermercado compra comida'], ['🥦', 'verdura fruteria sano'], ['🍎', 'fruta comida'], ['🥖', 'pan panaderia'],
    ['🥩', 'carne carniceria'], ['🐟', 'pescado pescaderia'], ['🍽️', 'restaurante comer fuera cena'], ['🍕', 'pizza comida rapida'],
    ['🍔', 'hamburguesa comida rapida'], ['🍣', 'sushi restaurante'], ['🥡', 'comida a domicilio delivery glovo'], ['☕', 'cafe cafeteria desayuno'],
    ['🥐', 'desayuno bolleria'], ['🍺', 'cerveza bar cañas'], ['🍷', 'vino copas'], ['🍸', 'copas cocteles fiesta'], ['🍰', 'postre tarta dulces'],
  ] },
  { title: 'Transporte', items: [
    ['🚗', 'coche auto'], ['⛽', 'gasolina combustible diesel'], ['🅿️', 'parking aparcamiento'], ['🚕', 'taxi uber cabify'],
    ['🚌', 'autobus bus'], ['🚇', 'metro transporte publico'], ['🚆', 'tren renfe cercanias'], ['✈️', 'avion vuelo viaje'],
    ['🛵', 'moto scooter'], ['🚲', 'bici bicicleta'], ['🛞', 'ruedas neumaticos taller'], ['🧰', 'taller mantenimiento itv'],
  ] },
  { title: 'Ocio y viajes', items: [
    ['🎉', 'ocio fiesta celebracion'], ['🎬', 'cine peliculas'], ['🎭', 'teatro espectaculos'], ['🎵', 'musica conciertos spotify'],
    ['🎮', 'videojuegos consola'], ['📚', 'libros lectura'], ['🎨', 'arte hobbies'], ['📸', 'fotografia camara'],
    ['🏖️', 'playa vacaciones'], ['🏔️', 'montaña esqui'], ['🧳', 'viaje maleta vacaciones'], ['🏨', 'hotel alojamiento'],
    ['🎟️', 'entradas eventos'], ['⚽', 'futbol deporte'], ['🎲', 'juegos'], ['🍿', 'streaming series netflix'],
  ] },
  { title: 'Salud y cuidado', items: [
    ['💊', 'farmacia medicinas'], ['🩺', 'medico salud seguro'], ['🦷', 'dentista'], ['👓', 'optica gafas'],
    ['💪', 'gimnasio deporte fitness'], ['🧘', 'yoga bienestar'], ['💇', 'peluqueria'], ['💅', 'estetica belleza'],
    ['🧴', 'cosmetica higiene'], ['🏃', 'running deporte'],
  ] },
  { title: 'Compras', items: [
    ['🛍️', 'compras shopping'], ['👗', 'ropa moda vestido'], ['👕', 'ropa camiseta'], ['👟', 'zapatillas calzado'],
    ['👜', 'bolso accesorios'], ['💍', 'joyas anillo boda'], ['💻', 'ordenador tecnologia'], ['🎧', 'auriculares electronica'],
    ['📦', 'amazon paquetes pedidos'], ['🎁', 'regalos cumpleaños navidad'], ['🧸', 'juguetes'], ['🖊️', 'papeleria material'],
  ] },
  { title: 'Familia y mascotas', items: [
    ['👶', 'bebe hijos'], ['🧒', 'niños hijos'], ['🎒', 'colegio escuela material'], ['🎓', 'estudios universidad formacion'],
    ['🐶', 'perro mascota'], ['🐱', 'gato mascota'], ['🐾', 'veterinario mascotas'], ['❤️', 'pareja amor'], ['💒', 'boda'],
  ] },
  { title: 'Dinero y ahorro', items: [
    ['💰', 'dinero ahorro'], ['🐷', 'hucha ahorro'], ['🏦', 'banco'], ['💳', 'tarjeta credito'], ['💶', 'euros efectivo'],
    ['📈', 'inversion bolsa'], ['📉', 'perdidas'], ['🪙', 'monedas cripto'], ['🛡️', 'imprevistos emergencia seguro'],
    ['🎯', 'meta objetivo'], ['🧮', 'cuentas presupuesto'], ['💼', 'trabajo negocio'], ['🤝', 'prestamo deuda'],
    ['📑', 'seguro poliza'], ['🏖', 'jubilacion'],
  ] },
  { title: 'Suscripciones', items: [
    ['📺', 'television tv suscripcion'], ['🎶', 'spotify musica suscripcion'], ['☁️', 'nube icloud almacenamiento'],
    ['📰', 'prensa periodico'], ['🔁', 'suscripcion recurrente'], ['🤖', 'ia software apps'],
  ] },
  { title: 'Otros', items: [
    ['📌', 'otros varios'], ['⭐', 'favorito especial'], ['🌍', 'donaciones ong'], ['⛪', 'iglesia'], ['🚬', 'tabaco'],
    ['🍀', 'loteria suerte apuestas'], ['📮', 'correos envios'], ['🧯', 'emergencias'],
  ] },
]

// Groups filtered by a search: every word must appear in the emoji's
// words (accent-insensitive). Empty groups are dropped.
export function searchEmoji(query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return EMOJI_GROUPS
  return EMOJI_GROUPS
    .map(g => ({ ...g, items: g.items.filter(([, words]) => terms.every(t => normalize(`${words} ${g.title}`).includes(t))) }))
    .filter(g => g.items.length)
}
