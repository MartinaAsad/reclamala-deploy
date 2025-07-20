import React, { useState } from 'react';
import axios from 'axios';
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
  Spinner,
  Alert,
  ProgressBar
} from 'react-bootstrap';
import { FaFileUpload, FaFilePdf, FaInfoCircle } from 'react-icons/fa';
import '../styles/styles.css'; 

function App() {
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState(null);
  const [texto, setTexto] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');
  const [progreso, setProgreso] = useState(0);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImagen(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imagen) return;

    const formData = new FormData();
    formData.append('imagen', imagen);

    try {
      setDescargando(true);
      setError('');
      setProgreso(30);
      
      const res = await axios.post('https://reclamala.vercel.app/api/descargo', formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setProgreso(percentCompleted);
        }
      });
      
      setTexto(res.data.texto);
      setProgreso(100);
      setTimeout(() => setProgreso(0), 1000);
    } catch (err) {
      setError('Error al procesar la imagen. Por favor, intente nuevamente.');
      setProgreso(0);
      console.error(err);
    } finally {
      setDescargando(false);
    }
  };

  const descargarPDF = async () => {
    if (!imagen) return;

    const formData = new FormData();
    formData.append('imagen', imagen);
    setDescargando(true);
    setError('');
    setProgreso(30);

    try {
      const res = await axios.post('https://reclamala.vercel.app/api/descargo', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setProgreso(percentCompleted);
        }
      });

      setProgreso(80);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `descargo_${new Date().toISOString().slice(0,10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setProgreso(100);
      setTimeout(() => setProgreso(0), 1000);
    } catch (err) {
      setError('Error al generar el documento PDF. Vuelva a intentar en 2 minutos');
      setProgreso(0);
      console.error(err);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Container className="my-5">
      <Row className="justify-content-center">
        <Col lg={8} className="mb-4">
          <Card className="shadow-sm border-0">
            <Card.Body className="p-4">
              <h2 className="text-center mb-4 text-primary">
                <FaFilePdf className="me-2" />
                Reclamala
              </h2>
              
              <Alert variant="info" className="d-flex align-items-center">
                <FaInfoCircle className="me-2" size={20} />
                <div>
                  Subí una imagen de tu multa y generaremos automáticamente un descargo legal 
                  con fundamentos jurídicos segun la ley Argentina para impugnarla. Recuerda que este servicio es
                  solo una guía y no sustituye el asesoramiento legal profesional.
                </div>
              </Alert>

              {error && (
                <Alert variant="danger" className="d-flex align-items-center">
                  <FaInfoCircle className="me-2" size={20} />
                  {error}
                </Alert>
              )}

              <Form onSubmit={handleSubmit}>
                <Form.Group controlId="formImagen" className="mb-4">
                  <Form.Label className="fw-bold mb-3">
                    <FaFileUpload className="me-2" />
                    Seleccionar imagen de la multa
                  </Form.Label>
                  <Form.Control
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="border-2"
                  />
                  <Form.Text className="text-muted">
                    Formatos aceptados: JPG, PNG, PDF (máx. 5MB)
                  </Form.Text>
                </Form.Group>

                {preview && (
                  <div className="mb-4 text-center">
                    <img
                      src={preview}
                      alt="Vista previa de la multa"
                      className="img-thumbnail preview-image"
                      style={{ maxHeight: '300px' }}
                    />
                  </div>
                )}

                {progreso > 0 && progreso < 100 && (
                  <ProgressBar 
                    now={progreso} 
                    label={`${progreso}%`} 
                    animated 
                    className="mb-4"
                  />
                )}

                <div className="d-flex justify-content-between">

                  <Button
                    variant="primary"
                    type="button"
                    onClick={descargarPDF}
                    disabled={descargando || !imagen}
                    className="flex-grow-1"
                  >
                    {descargando ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Generando PDF...
                      </>
                    ) : (
                      <>
                        <FaFilePdf className="me-2" />
                        Descargar PDF
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default App;
