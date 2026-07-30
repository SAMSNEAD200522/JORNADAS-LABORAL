const XLSX = require('xlsx');

const data = [
  { 'Postulado_nombre': 'Juan Perez Lopez', 'Cargo': 'Auxiliar Administrativo', 'Documento': '1098765432', 'Contacto': '3101234567' },
  { 'Postulado_nombre': 'Maria Garcia', 'Cargo': 'Tecnico de Campo', 'Documento': '52345678', 'Contacto': '3119876543' },
  { 'Postulado_nombre': 'Pedro Sanchez', 'Cargo': 'Vigilante', 'Documento': '80123456', 'Contacto': '3155551234' },
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
XLSX.writeFile(wb, 'C:\\Users\\Usuario\\mi-proyecto\\test_import.xlsx');
console.log('Created test_import.xlsx with', data.length, 'rows');
