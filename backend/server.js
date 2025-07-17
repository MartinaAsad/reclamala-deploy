import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
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

// Configuración de middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));

// Configurar servicios
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_VISION_KEY_PATH
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
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
    throw new Error('Error al procesar la imagen con OCR');
  }
}

async function generateLegalDefense(textoMulta) {
  const legalPrompt = `
  Genera un descargo formal para impugnar esta multa, y no quiero que la redactes como si fueses un abogado. Solo quiero que sea de un tono formal:

  "${textoMulta}"

  FUNDAMENTOS ARGENTINOS (BASE):
- Ley 24.449 y artículo 70: requisitos formales del acta y derecho a defensa
- Notificación válida y dentro de plazos legales
- Prescripción a los 2 años sin resolución ni notificación válida
- Requisitos de homologación y señalización de dispositivos técnicos (cámaras, radares)
- Prueba fehaciente: foto clara con patente, fecha, hora y lugar
- Respuestas específicas según tipo de infracción (peajes con Telepase, velocidad, semáforos)
- Derecho al debido proceso

GENERACIÓN DEL DOCUMENTO DE RESPUESTA:
- Impugnar cada punto cuestionando errores, falta de notificación, prescripción o insuficiencia probatoria
- Solicitar nulidad o archivo si corresponde
- Usar lenguaje profesional, objetivo y respetuoso, sin promesas o garantías
-No utilizar los simbolos de **
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
app.post('api/descargo', upload.single('imagen'), async (req, res) => {
  let imagePath = req.file?.path;

  try {
    // Validar archivo subido
    if (!imagePath) {
      return res.status(400).json({ error: 'No se proporcionó imagen' });
    }

    // Procesamiento en tres pasos
    const extractedText = await extractTextFromImage(imagePath);
    const legalDefense = await generateLegalDefense(extractedText);
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
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
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