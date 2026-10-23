// Librerías externas, todas por CDN y con versión fija. Cambia versiones solo aquí.
// Preact + htm en un solo archivo (~13 KB): componentes tipo React sin compilar nada.
export {
  h, html, render, Component, createContext,
  useState, useReducer, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext,
} from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';

// Firebase JS SDK (gstatic). Se importa en js/firebase.js con esta misma versión.
export const FIREBASE_VERSION = '12.19.0';
