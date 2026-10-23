// Configuración pública de la app.
//
// firebaseConfig: cópiala de Firebase Console → Configuración del proyecto → Tus apps → Web.
// NO es un secreto: identifica tu proyecto, no da acceso. Lo que protege los datos son las
// reglas de Firestore (firestore.rules). Aun así, restringe la API key a tu dominio
// (ver docs/SETUP.md, paso 6).

export const firebaseConfig = {
  apiKey: 'AIzaSyA9kY9V2BY_Qorquy3C2_9NRJM802_VEiw',
  authDomain: 'push-harder-b0bfc.firebaseapp.com',
  projectId: 'push-harder-b0bfc',
  appId: '1:192063521004:web:9c182f368d02325581a5c9',
};

export const isConfigured = () => !String(firebaseConfig.apiKey).startsWith('PEGA_AQUI');
