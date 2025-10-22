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
const aiModel = genAI.getGenerativeModel({ model: 'gemini-5.5-flash' });

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

async function generateLegalDefense(textoMulta, nombres, apellidos, dni, fueNotificado, informacionAdicional) {
  // Construir el nombre completo
  const nombreCompleto = `${nombres} ${apellidos}`;
  
  const legalPrompt = `Quiero que actúes como un experto legal especializado en impugnación de multas de tránsito en Argentina (Ley 24.449 y normativa complementaria). Tu tarea es redactar un descargo administrativo contundente y formal, listo para ser presentado ante la autoridad de tránsito.

1. Tenes los siguientes datos del usuario los siguientes datos:
   - Nombre completo: ${nombreCompleto}
   - DNI: ${dni}
    - Fue notificado: ${fueNotificado ? 'Sí' : 'No'}
    - Información adicional: ${informacionAdicional || 'Ninguna'}
    - Texto de la multa: ${textoMulta}
2. Con esa información, generá un descargo administrativo con este formato:
   - Cuerpo del texto:
       a) Párrafo introductorio con todos los datos de la infracción.
       b) Listado numerado de fundamentos (mínimo 7 puntos):  
          1. Requisitos formales del acta y derecho a la defensa (Ley 24.449, artículo 70)  
          2. Notificación válida y plazos legales
          3. Prescripción  
          4. Homologación y señalización de dispositivos técnicos
          5. Prueba fehaciente
          6. Circunstancias particulares del caso  
          7. Derecho al debido proceso
       c) Cierre con solicitud de nulidad del acta.
3. Todo el texto debe estar en español neutro, con estilo jurídico-formal, evitando repeticiones y siendo persuasivo.
4. No omitas ningún punto legal importante, aunque el usuario no lo mencione expresamente.  
5. Generá la salida final en un texto limpio, sin corchetes ni marcadores, listo para copiar a Word o PDF con formato de justificación y estilo profesional.
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
       .text('Descargo', { align: 'center', underline: true });
    
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

    const { nombres, apellidos, dni,fueNotificado, informacionAdicional } = req.body;

    // Procesamiento en tres pasos
    const extractedText = await extractTextFromImage(imagePath);
    const legalDefense = await generateLegalDefense(extractedText,  nombres, apellidos, dni, fueNotificado, informacionAdicional);
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