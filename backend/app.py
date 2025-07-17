from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import os
import pytesseract
from PIL import Image
from werkzeug.utils import secure_filename
from fpdf import FPDF

app = Flask(__name__)
#CORS(app, origins=["http://localhost:5500", "http://127.0.0.1:5500"])  # Permitir requests desde cualquier origen
CORS(app, resources={r"/*": {"origins": "*"}})

# O esto (para producción):
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5500", 
            "http://127.0.0.1:5500",
            "http://localhost:5000",
            "http://127.0.0.1:5000"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "descargos"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

# Crear directorios si no existen
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def allowed_file(filename):
    """Verifica si el archivo tiene una extensión permitida"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def home():
    return "ImpugnaYa Backend operativo"

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        # Verificar si se envió un archivo
        if 'file' not in request.files:
            return jsonify({"error": "No se envió archivo"}), 400
        
        file = request.files['file']
        
        # Verificar si se seleccionó un archivo
        if file.filename == '':
            return jsonify({"error": "No se seleccionó archivo"}), 400
        
        # Verificar extensión del archivo
        if not allowed_file(file.filename):
            return jsonify({"error": "Formato no soportado. Solo se permiten: PNG, JPG, JPEG"}), 400
        
        # Guardar archivo
        filename = secure_filename(file.filename)
        if not filename:
            return jsonify({"error": "Nombre de archivo inválido"}), 400
            
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        print(f"\n[DEBUG 1] Ruta completa del archivo: {os.path.abspath(filepath)}")  # Debug 1: Ruta
        file.save(filepath)

        # Procesar OCR - Debug detallado
        try:
            # Debug 2: Verificar imagen antes de OCR
            print(f"[DEBUG 2] Verificando imagen...")
            image = Image.open(filepath)
            print(f"[DEBUG 3] Formato: {image.format}, Modo: {image.mode}, Tamaño: {image.size}")
            
            # Debug 4: Verificar Tesseract
            print(f"[DEBUG 4] Ruta Tesseract: {pytesseract.pytesseract.tesseract_cmd}")
            print(f"[DEBUG 5] Idiomas instalados: {pytesseract.get_languages(config='')}")
            
            # Procesar OCR
            print(f"[DEBUG 6] Procesando OCR...")
            text = pytesseract.image_to_string(image, lang='spa')
            print(f"[DEBUG 7] Texto extraído (primeras 50 chars):\n{text[:50]}...")  # Muestra preview
            
        except Exception as e:
            # Debug 8: Error específico
            print(f"[ERROR OCR] Detalles del fallo: {str(e)}")
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({
                "error": f"Error en OCR: {str(e)}",
                "sugerencia": "Verifica que la imagen sea legible y que Tesseract tenga el idioma 'spa' instalado."
            }), 500

        # Éxito
        return jsonify({
            "extracted_text": text.strip(),
            "filename": filename,
            "success": True
        })
    
    except Exception as e:
        print(f"[ERROR GLOBAL] Error inesperado: {str(e)}")
        return jsonify({
            "error": f"Error interno del servidor: {str(e)}",
            "sugerencia": "Revisa los logs del backend para más detalles."
        }), 500

@app.route('/generar-descargo', methods=['POST'])
def generar_descargo():
    try:
        # Verificar que el request contenga JSON
        if not request.is_json:
            return jsonify({"error": "Content-Type debe ser application/json"}), 400
        
        data = request.json
        if not data:
            return jsonify({"error": "No se enviaron datos"}), 400
            
        texto = data.get("texto", "").strip()
        if not texto:
            return jsonify({"error": "El texto no puede estar vacío"}), 400
        
        nombre_base = data.get("nombre", "descargo").strip()
        if not nombre_base:
            nombre_base = "descargo"
            
        nombre_salida = secure_filename(nombre_base) + ".pdf"
        salida_path = os.path.join(OUTPUT_FOLDER, nombre_salida)

        # Generar PDF con manejo de caracteres especiales
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        
        # Texto del descargo con mejor formato
        contenido = f"""AL SR. JUEZ DE FALTAS:

En relación al acta de infracción, se presenta el siguiente descargo:

{texto}

Solicito el archivo de la causa.

Firma: ____________________

Fecha: ____________________"""
        
        # Manejar caracteres especiales
        contenido_encoded = contenido.encode('latin-1', 'replace').decode('latin-1')
        pdf.multi_cell(0, 10, contenido_encoded)
        
        pdf.output(salida_path)

        return jsonify({
            "pdf_generado": nombre_salida,
            "success": True,
            "mensaje": "PDF generado exitosamente"
        })
    
    except Exception as e:
        return jsonify({"error": f"Error al generar PDF: {str(e)}"}), 500

@app.route('/download/<nombre>', methods=['GET'])
def download_file(nombre):
    try:
        # Sanitizar nombre del archivo
        nombre_seguro = secure_filename(nombre)
        if not nombre_seguro:
            return jsonify({"error": "Nombre de archivo inválido"}), 400
            
        filepath = os.path.join(OUTPUT_FOLDER, nombre_seguro)
        
        # Verificar que el archivo existe y está en el directorio correcto
        if not os.path.exists(filepath):
            return jsonify({"error": "Archivo no encontrado"}), 404
        
        # Verificar que el archivo está dentro del directorio permitido
        if not os.path.abspath(filepath).startswith(os.path.abspath(OUTPUT_FOLDER)):
            return jsonify({"error": "Acceso denegado"}), 403
            
        return send_file(filepath, as_attachment=True, download_name=nombre_seguro)
    
    except Exception as e:
        return jsonify({"error": f"Error al descargar archivo: {str(e)}"}), 500

# Manejo de errores globales
@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "Archivo demasiado grande. Máximo 16MB"}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint no encontrado"}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Error interno del servidor"}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)