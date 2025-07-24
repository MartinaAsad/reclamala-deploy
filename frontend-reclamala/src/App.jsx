import React, { useState } from "react";
import axios from "axios";
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
  Spinner,
  Alert,
  ProgressBar,
} from "react-bootstrap";
import {
  FaFileUpload,
  FaFilePdf,
  FaInfoCircle,
  FaUser,
  FaIdCard,
} from "react-icons/fa";
import "../styles/styles.css";

function App() {
  const [imagen, setImagen] = useState(null);
  const [fueNotificado, setFueNotificado] = useState("");
  const [informacionAdicional, setInformacionAdicional] = useState("");
  const [dni, setDni] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [preview, setPreview] = useState(null);
  const [texto, setTexto] = useState("");
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");
  const [progreso, setProgreso] = useState(0);
  const [errors, setErrors] = useState({});

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImagen(file);
      setPreview(URL.createObjectURL(file));
      // Limpiar error de imagen si existe
      if (errors.imagen) {
        setErrors((prev) => ({ ...prev, imagen: "" }));
      }
    }
  };

  const handleInputChange = (field, value) => {
    switch (field) {
      case "nombres":
        setNombres(value);
        break;
      case "apellidos":
        setApellidos(value);
        break;
      case "dni":
        setDni(value);
        break;
    }

    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Validar nombres
    if (!nombres.trim()) {
      newErrors.nombres = "Los nombres son obligatorios";
    } else if (nombres.trim().length < 2) {
      newErrors.nombres = "Los nombres deben tener al menos 2 caracteres";
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombres)) {
      newErrors.nombres = "Los nombres solo pueden contener letras y espacios";
    }

    // Validar apellidos
    if (!apellidos.trim()) {
      newErrors.apellidos = "Los apellidos son obligatorios";
    } else if (apellidos.trim().length < 2) {
      newErrors.apellidos = "Los apellidos deben tener al menos 2 caracteres";
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(apellidos)) {
      newErrors.apellidos =
        "Los apellidos solo pueden contener letras y espacios";
    }

    // Validar DNI
    if (!dni.trim()) {
      newErrors.dni = "El DNI es obligatorio";
    } else if (!/^\d{7,8}$/.test(dni.replace(/\./g, ""))) {
      newErrors.dni = "El DNI debe tener 7 u 8 dígitos";
    }

    // Validar imagen
    if (!imagen) {
      newErrors.imagen = "Debe seleccionar una imagen de la multa";
    }

    if (!fueNotificado) {
      newErrors.fueNotificado = 'Debe indicar si fue notificado';
    }


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatDNI = (value) => {
    // Remover todo lo que no sean números
    const numbers = value.replace(/\D/g, "");

    const limited = numbers.slice(0, 8);
    if (limited.length > 6) {
      return limited.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
    } else if (limited.length > 3) {
      return limited.replace(/(\d{2})(\d{1,3})/, "$1.$2");
    }

    return limited;
  };

  const handleDNIChange = (e) => {
    const formattedValue = formatDNI(e.target.value);
    handleInputChange("dni", formattedValue);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const formData = new FormData();
    formData.append("imagen", imagen);
    formData.append("nombres", nombres.trim());
    formData.append("apellidos", apellidos.trim());
    formData.append("dni", dni.replace(/\./g, "")); // Enviar DNI sin puntos
    formData.append('fueNotificado', fueNotificado);
    formData.append('informacionAdicional', informacionAdicional.trim());


    try {
      setDescargando(true);
      setError("");
      setProgreso(30);

      const res = await axios.post(
        "https://reclamala-deploy.onrender.com/api/descargo",
        formData,
        {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgreso(percentCompleted);
          },
        }
      );

      setTexto(res.data.texto);
      setProgreso(100);
      setTimeout(() => setProgreso(0), 1000);
    } catch (err) {
      setError(
        "Error al procesar la información. Por favor, intente nuevamente."
      );
      setProgreso(0);
      console.error(err);
    } finally {
      setDescargando(false);
    }
  };

  const descargarPDF = async () => {
    if (!validateForm()) {
      return;
    }

    const formData = new FormData();
    formData.append("imagen", imagen);
    formData.append("nombres", nombres.trim());
    formData.append("apellidos", apellidos.trim());
    formData.append("dni", dni.replace(/\./g, "")); // Enviar DNI sin puntos

    setDescargando(true);
    setError("");
    setProgreso(30);

    try {
      const res = await axios.post(
        "https://reclamala-deploy.onrender.com/api/descargo",
        formData,
        {
          responseType: "blob",
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgreso(percentCompleted);
          },
        }
      );

      setProgreso(80);
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `descargo_${nombres.trim()}_${apellidos.trim()}_${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      setProgreso(100);
      setTimeout(() => setProgreso(0), 1000);
    } catch (err) {
      setError(
        "Error al generar el documento PDF. Vuelva a intentar en 2 minutos"
      );
      setProgreso(0);
      console.error(err);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Container className="py-4">
      <Row className="justify-content-center">
        <Col lg={8} xl={7}>
          <Card className="shadow-sm border-0">
            <Card.Body className="p-4">
              <h2 className="text-center mb-4 text-primary">
                <FaFilePdf className="me-2" />
                Reclamala
              </h2>

              <Alert variant="info" className="d-flex">
                <FaInfoCircle className="me-2 flex-shrink-0" size={20} />
                <div>
                  Subí una imagen de tu multa y completá tus datos personales
                  para generar automáticamente un descargo legal con fundamentos
                  jurídicos según la ley Argentina para impugnarla. Recuerda que
                  este servicio es solo una guía y no sustituye el asesoramiento
                  legal profesional.
                </div>
              </Alert>

              {error && (
                <Alert variant="danger" className="d-flex">
                  <FaInfoCircle className="me-2 flex-shrink-0" size={20} />
                  <div>{error}</div>
                </Alert>
              )}

              <Form onSubmit={handleSubmit}>
                {/* Campos de datos personales */}
                <Row className="mb-4">
                  <Col md={6} className="mb-3 mb-md-0">
                    <Form.Group controlId="formNombres">
                      <Form.Label className="fw-bold">
                        <FaUser className="me-2" />
                        Nombres *
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Ingrese sus nombres"
                        value={nombres}
                        onChange={(e) =>
                          handleInputChange("nombres", e.target.value)
                        }
                        isInvalid={!!errors.nombres}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.nombres}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group controlId="formApellidos">
                      <Form.Label className="fw-bold">
                        <FaUser className="me-2" />
                        Apellidos *
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Ingrese sus apellidos"
                        value={apellidos}
                        onChange={(e) =>
                          handleInputChange("apellidos", e.target.value)
                        }
                        isInvalid={!!errors.apellidos}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.apellidos}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-4">
                  <Col md={6}>
                    <Form.Group controlId="formDNI">
                      <Form.Label className="fw-bold">
                        <FaIdCard className="me-2" />
                        DNI *
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="12.345.678"
                        value={dni}
                        onChange={handleDNIChange}
                        isInvalid={!!errors.dni}
                        maxLength={10}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.dni}
                      </Form.Control.Feedback>
                      <Form.Text className="text-muted">
                        Formato: 12.345.678 (sin espacios)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>

                {/* Campo de imagen */}
                <Form.Group controlId="formImagen" className="mb-4">
                  <Form.Label className="fw-bold">
                    <FaFileUpload className="me-2" />
                    Seleccionar imagen de la multa *
                  </Form.Label>
                  <Form.Control
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    isInvalid={!!errors.imagen}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.imagen}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    Formatos aceptados: JPG, PNG, PDF (máx. 5MB)
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">
                    ¿Fue notificado? *
                  </Form.Label>
                  <div>
                    <Form.Check
                      inline
                      label="Sí"
                      name="fueNotificado"
                      type="radio"
                      id="notificado-si"
                      checked={fueNotificado === "si"}
                      onChange={() => setFueNotificado("si")}
                    />
                    <Form.Check
                      inline
                      label="No"
                      name="fueNotificado"
                      type="radio"
                      id="notificado-no"
                      checked={fueNotificado === "no"}
                      onChange={() => setFueNotificado("no")}
                    />
                  </div>
                </Form.Group>

                {/* Campo: Información adicional */}
                <Form.Group
                  controlId="formInformacionAdicional"
                  className="mb-4"
                >
                  <Form.Label className="fw-bold">
                    Información adicional (opcional)
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    maxLength={500}
                    placeholder="Agregue aquí cualquier detalle relevante..."
                    value={informacionAdicional}
                    onChange={(e) => setInformacionAdicional(e.target.value)}
                  />
                  <Form.Text className="text-muted">
                    Máximo 500 caracteres
                  </Form.Text>
                </Form.Group>

                {preview && (
                  <div className="mb-4 text-center">
                    <img
                      src={preview}
                      alt="Vista previa de la multa"
                      className="img-thumbnail img-fluid"
                      style={{ maxHeight: "300px" }}
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

                <div className="d-grid">
                  <Button
                    variant="primary"
                    type="button"
                    onClick={descargarPDF}
                    disabled={descargando}
                    size="lg"
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
                        Generar y Descargar PDF
                      </>
                    )}
                  </Button>
                </div>
              </Form>

              <div className="mt-3 text-center">
                <small className="text-muted">* Campos obligatorios</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default App;
