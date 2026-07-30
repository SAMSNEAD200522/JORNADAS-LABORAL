const XLSX = require('xlsx');
const data = [
  { 'Postulado_nombre': 'Juan Perez Lopez', 'Cargo': 'Auxiliar Administrativo', 'Documento': '1098765432', 'Contacto': '3001234567' },
  { 'Postulado_nombre': 'Maria Garcia', 'Cargo': 'Tecnico de Campo', 'Documento': '52345678', 'Contacto': '3119876543' },
];
const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
XLSX.writeFile(wb, 'C:\\Users\\Usuario\\mi-proyecto\\test_import2.xlsx');
console.log('Created');
