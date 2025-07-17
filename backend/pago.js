// SDK de Mercado Pago
import { MercadoPagoConfig, Preference } from 'mercadopago';
// Agrega credenciales
const client = new MercadoPagoConfig({ accessToken: 'YOUR_ACCESS_TOKEN' });

const preference = new Preference(client);

preference.create({
  body: {
    items: [
      {
        title: 'Descargo',
        quantity: 1,
        unit_price: 10000
      }
    ],
     back_urls: {
        success: "https://www.tu-sitio/success",
        failure: "https://www.tu-sitio/failure",
        pending: "https://www.tu-sitio/pending"
      },
  }
})
.then(console.log)
.catch(console.log);