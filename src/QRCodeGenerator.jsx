import { QRCodeCanvas } from 'qrcode.react';

function QRCodeGenerator() {
  const url = "https://my-warehouse-app.netlify.app/";
  return (
    <div style={{ textAlign: 'center', marginTop: '20px' }}>
      <h3>สแกนเพื่อเข้าใช้งานระบบคลังสินค้า</h3>
      <QRCodeCanvas value={url} size={200} level={"H"} />
      <p>{url}</p>
    </div>
  );
}

export default QRCodeGenerator; // <--- ต้องมีบรรทัดนี้ครับ