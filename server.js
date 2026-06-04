require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const path = require('path');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(express.static(path.join(__dirname, 'public')));

// Conversiones imperiales → métricas
function toMetric(data) {
  const imperial = data.sistema_unidades === 'Libras, pies y pulgadas';
  let altura_cm, peso_kg, cuello_cm, cintura_cm, cadera_cm;

  if (imperial) {
    const raw = parseFloat(data.altura_imp) || 0;
    const pies = Math.floor(raw);
    const pulgadas = Math.round((raw - pies) * 100); // 5.11 → 11 pulgadas
    altura_cm = Math.round((pies * 30.48) + (pulgadas * 2.54));
    peso_kg   = Math.round(parseFloat(data.peso) * 0.453592 * 10) / 10;
    cuello_cm  = Math.round(parseFloat(data.cuello)  * 2.54 * 10) / 10;
    cintura_cm = Math.round(parseFloat(data.cintura) * 2.54 * 10) / 10;
    cadera_cm  = parseFloat(data.cadera) ? Math.round(parseFloat(data.cadera) * 2.54 * 10) / 10 : 0;
  } else {
    altura_cm  = parseFloat(data.altura);
    peso_kg    = parseFloat(data.peso);
    cuello_cm  = parseFloat(data.cuello);
    cintura_cm = parseFloat(data.cintura);
    cadera_cm  = parseFloat(data.cadera) || 0;
  }

  // Pre-values: raw input del usuario
  const pre_altura  = imperial ? parseFloat(data.altura_imp) : parseFloat(data.altura);
  const pre_peso    = parseFloat(data.peso);
  const pre_cuello  = parseFloat(data.cuello);
  const pre_cintura = parseFloat(data.cintura);
  const pre_cadera  = parseFloat(data.cadera) || 0;

  return { altura_cm, peso_kg, cuello_cm, cintura_cm, cadera_cm, pre_altura, pre_peso, pre_cuello, pre_cintura, pre_cadera };
}

app.post('/submit', upload.array('examenes', 10), async (req, res) => {
  try {
    const data = req.body;
    const { altura_cm, peso_kg, cuello_cm, cintura_cm, cadera_cm, pre_altura, pre_peso, pre_cuello, pre_cintura, pre_cadera } = toMetric(data);

    // Subir todos los exámenes a Cloudinary
    let adjunto = [];
    if (req.files && req.files.length > 0) {
      const uploads = req.files.map(file =>
        new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'imnufit-evaluaciones', resource_type: 'auto' },
            (err, result) => err ? reject(err) : resolve({ url: result.secure_url })
          ).end(file.buffer);
        })
      );
      adjunto = await Promise.all(uploads);
    }

    const hoy = new Date().toISOString().split('T')[0];

    // Campos de Airtable — usando IDs para mayor confiabilidad
    const fields = {
      fldTTqztdiJgcm02r: data.nombre,                         // Nombre completo
      fldVYMSwTVk7tmymq: hoy,                                 // Fecha de creación
      fldZL0Mym1BjiFpYE: data.genero,                        // Género
      fldJ504yWyVLsNnh0: parseInt(data.edad),                 // Edad
      fldicS9aEG2BFP0Wz: data.email,                          // Email
      fld9yFXMV7JpYqNfy: data.pais,                           // País
      fld8UVVYNAGmybDvZ: data.whatsapp,                       // WhatsApp
      fldzr04bmfwrLMcPU: data.sistema_unidades,               // Sistema de unidades
      fldswQ5SghQuctPG5: pre_altura,                          // Pre-Altura
      fldv1ARykk8iHwvCo: altura_cm,                           // Altura (cm)
      fldmBpMRD5O8ZoUc7: pre_peso,                            // Pre-peso
      fldpQEQmYvupWRCFE: peso_kg,                             // Peso (kg)
      fldcNapXfVlzaluWk: pre_cuello,                          // Pre-cuello
      fld7lXs1vq3gZHYxO: cuello_cm,                           // Cuello (cm)
      fldndF8IU0bpaTSyX: pre_cintura,                         // Pre-cintura
      fld0Po9cvBaScjrvr: cintura_cm,                          // Cintura (cm)
      fldN5ovNRtdF0zcPV: pre_cadera,                          // Pre-cadera
      fld4JnmUUyTLlnpu5: cadera_cm,                           // Cadera (cm)
      fldeG8DPcvxBPRfI6: data.motivo,                         // Motivo de consulta
      fldfNWlEYTepJRH8h: data.impedimentos,                   // Impedimentos
      fldWms7zMt5i8YziO: data.actividad,                      // Nivel de actividad física
      fldeOJW0cipk9pPkk: data.tipo_actividad || '',           // Tipo de actividad física
      fldF8M1tG8tycGCk1: data.constipacion,                   // ¿Constipación?
      fldHTp7FoZ0FPSoSa: data.ansiedad,                       // ¿Cambia consumo al estar triste?
      fldhmkArdnX3flPbx: parseFloat(data.agua),              // Litros de agua al día
      fldg5pY1K6hcEOOZD: data.hora_hambre,                   // ¿Hora de mayor hambre?
      fld30bP0A2GWpPLqL: parseInt(data.comidas),             // ¿Comidas al día?
      fldo6p2j37tz65bDW: data.enfermedades || 'No tengo',    // Enfermedades
      fld5oGTk2ADVWC21u: data.medicamentos || 'No tomo',     // Medicamentos
      fldFpzmx9r97JgFKE: data.terminos === 'true',           // Aceptar términos
    };

    // Ciclo menstrual — siempre se envía ('No tengo' para hombres)
    if (data.ciclo) {
      fields.fldWJUkH77DAFIl7S = data.ciclo;
    }

    // Adjunto de examen
    if (adjunto.length > 0) {
      fields.fldqdwwd3GQU75MEQ = adjunto;
    }

    const response = await fetch(
      `https://api.airtable.com/v0/appCHcm7XPzeoyBCs/tblTrSA4seatELA7v`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(JSON.stringify(err));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error en /submit:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
