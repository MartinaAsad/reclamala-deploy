import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
//import fs from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import vision from '@google-cloud/vision';


// Configuración inicial
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const UPLOADS_DIR = 'uploads/';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Validar variables de entorno
const requiredEnvVars = ['GOOGLE_AI_API_KEY', 'GOOGLE_VISION_KEY_PATH'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Falta la variable de entorno ${envVar}`);
    process.exit(1);
  }
}

const corsOptions = {
  origin: [
    'http://localhost:5173',
    'https://reclamala.vercel.app',
    'https://reclamala-deploy.onrender.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Cache-Control'
  ],
  credentials: false,  
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

  const visionKeyPath = join('/tmp', 'vision-key.json');
try {
  writeFileSync(visionKeyPath, process.env.GOOGLE_VISION_CREDENTIALS || '{}');
  console.log('Archivo de credenciales creado en:', visionKeyPath);
} catch (err) {
  console.error('Error al crear archivo de credenciales:', err);
  process.exit(1);
}


// Configurar servicios
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: visionKeyPath
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Configurar multer para subida de archivos
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  }
});

// Crear directorio de uploads si no existe
if (existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Funciones de utilidad
async function extractTextFromImage(imagePath) {
  try {
    const [result] = await visionClient.textDetection(imagePath);
    if (!result.textAnnotations || result.textAnnotations.length === 0) {
      throw new Error('No se detectó texto en la imagen');
    }
    return result.textAnnotations[0].description;
  } catch (error) {
    console.error('Error en OCR:', error);
    throw new Error('Error al procesar la imagen con OCR',error);
  }
}

async function generateLegalDefense(textoMulta, nombres, apellidos, dni) {
  // Construir el nombre completo
  const nombreCompleto = `${nombres} ${apellidos}`;
  
  const legalPrompt = `Eres un analista experto en infracciones de tránsito en Argentina, especializado en detectar errores formales, vacíos legales y fallos probatorios en actas de tránsito para generar un DESCARGO sólido, en nombre propio, que permita invalidarlas o reducir su efecto. Utiliza este texto como base para tu análisis:

${textoMulta}

DATOS DEL INFRACTOR:
- Nombre completo: ${nombreCompleto}
- DNI: ${dni}

Objetivos principales:
1. Analizar todos los datos del acta (número, fecha, hora, lugar, descripción de la infracción, fotos, radar, etc.) y buscar inconsistencias.
2. Comparar los datos visibles en la foto (patente, marca, modelo, color) con los que aparecen en la cédula verde (si se sube). Señalar cualquier diferencia.
3. Verificar si hay elementos probatorios como cinturón de seguridad, luces, telepase, casco, etc. Si el acta dice "sin cinturón" pero la foto lo muestra puesto, indicarlo en el descargo.
4. Si el acta está mal redactada, incompleta, ilegible, sin fecha, sin hora, sin datos del agente, o sin firma digital válida, indicarlo expresamente.
5. Generar solo el texto del DESCARGO (no "descargo administrativo" ni "descargo legal") con redacción clara, fundamentación legal mínima y formato formal.
6. Todo en castellano perfecto, con interlineado y justificado como texto legal.

---

Reglas de redacción:
Encabezado: Siempre iniciar con "DESCARGO".
Identificación: 
- Nombre completo: ${nombreCompleto}
- DNI: ${dni}

Estructura básica:
1. Argumentos principales:
   - Errores formales: acta incompleta, falta de datos obligatorios, contradicciones.
   - Prueba insuficiente: fotos borrosas, imposibilidad de identificar patente, cinturón visible, telepase activo, etc.
   - Discrepancias con cédula verde (si la información no coincide).
2. Solicitud final: "Solicito la nulidad del acta o, en su defecto, su desestimación por falta de prueba suficiente".
3. Cierre con datos personales y firma (${nombreCompleto} - DNI: ${dni}).

---

Chequeos obligatorios:
1. Cinturón de seguridad: Si el acta alega "sin cinturón" pero en la foto se ve puesto, remarcarlo en el descargo. Si no se ve bien, pedir que la autoridad aporte prueba suficiente.
2. Telepase: Si el usuario alega que estaba activo y visible (y aparece en foto), señalar la validez de ese medio de pago.
3. Cédula verde: Si el usuario la sube, verificar que marca, modelo y patente coincidan con el acta. Si hay diferencias, incluirlo como argumento fuerte.
4. Distancia: No mencionar automáticamente el tema de 60 km (se quita por ahora, salvo que el usuario lo pida).
5. Legibilidad: Detectar datos faltantes: hora, fecha, lugar, firma, radar no homologado, etc.

---

Prohibiciones y advertencias:
- Nunca usar la expresión "descargo legal" ni "descargo administrativo".
- No asumir datos inexistentes: si falta una foto, decir "no se adjuntó prueba fotográfica".
- No prometer resultados: evitar frases como "esta multa será anulada", solo fundamentar.
- Siempre hablar en nombre propio (no en nombre de terceros).
- No solicitar cédula verde como requisito obligatorio.

---

Salida esperada: Un texto de DESCARGO listo para copiar, con formato tipo documento legal:
- Castellano formal.
- Párrafos justificados.
- Tamaño de letra 11 o 12.
- Interlineado 1.5.
- Firma con ${nombreCompleto} - DNI: ${dni}.
`;

  try {
    const result = await aiModel.generateContent(legalPrompt);
    return result.response.text();
  } catch (error) {
    console.error('Error en generación de descargo:', error);
    throw new Error('Error al generar el descargo legal');
  }
}

function createPDFBuffer(content) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Estilo profesional para documento legal
    doc.font('Times-Roman')
       .fontSize(16)
       .text('DESCARGO ADMINISTRATIVO', { align: 'center', underline: true });
    
    doc.moveDown(1);
    
    doc.fontSize(12)
       .text(content, { 
         align: 'justify', 
         lineGap: 2,
         paragraphGap: 2,
         indent: 30
       });

    doc.end();
  });
}

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API de Reclamala funcionando correctamente',
    status: 'online',
    endpoints: {
      'POST /api/descargo': 'Procesar imagen y generar descargo PDF'
    },
    timestamp: new Date().toISOString()
  });
});
app.post('/api/descargo', upload.single('imagen'), async (req, res) => {
  let imagePath = req.file?.path;

  try {
    // Validar archivo subido
    if (!imagePath) {
      return res.status(400).json({ error: 'No se proporcionó imagen' });
    }

    const { nombres, apellidos, dni } = req.body;

    // Procesamiento en tres pasos
    const extractedText = await extractTextFromImage(imagePath);
    const legalDefense = await generateLegalDefense(extractedText,  nombres, apellidos, dni);
    const pdfBuffer = await createPDFBuffer(legalDefense);

    // Configurar respuesta
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=descargo.pdf',
      'Content-Length': pdfBuffer.length
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error en endpoint /descargo:', error);
    return res.status(500).json({ 
      error: error.message || 'Error al procesar la solicitud' 
    });
  } finally {
    // Limpieza segura del archivo temporal
    if (imagePath && existsSync(imagePath)) {
      try {
        unlinkSync(imagePath);
      } catch (cleanupError) {
        console.error('Error al limpiar archivo temporal:', cleanupError);
      }
    }
  }
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error global:', err.stack);
  res.status(500).json({ error: 'Ocurrió un error en el servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🟢 Servidor escuchando en http://localhost:${PORT}`);
});