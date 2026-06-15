import type { AgreementData } from '@/app/actions/agreement'

interface Props {
  data: AgreementData
  signatureDataUrl: string | null
  idCard: string
  address: string
  signedDate: Date
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  })
}

function thaiShortDate(s: string) {
  return new Date(s).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  })
}

function numTH(n: number) {
  return n.toLocaleString('th-TH')
}

const D = (n = 18) => '.'.repeat(n)

// สไตล์สำหรับข้อมูลที่กรอกลงไป → ตัวหนา + ขีดเส้นใต้
const fillStyle: React.CSSProperties = {
  fontWeight: 'bold',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
}
function F({ children }: { children: React.ReactNode }) {
  return <span style={fillStyle}>{children}</span>
}

export function AgreementTemplate({ data, signatureDataUrl, idCard, address, signedDate }: Props) {
  const { tenant, contract, settings } = data
  const room = contract.room

  const p: React.CSSProperties = { margin: '0 0 10px 0' }
  const h: React.CSSProperties = { margin: '0 0 4px 0', fontWeight: 'bold' }

  return (
    <div
      id="agreement-template"
      style={{
        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
        fontSize: '14px',
        lineHeight: '1.85',
        color: '#000',
        backgroundColor: '#fff',
        width: '794px',
      }}
    >
    {/* ── หน้า 1 (สูงพอดี A4 = 1123px) ── */}
    <div style={{ height: '1123px', padding: '52px 56px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* ── ชื่อเรื่อง ── */}
      <h1 style={{
        textAlign: 'center',
        fontSize: '18px',
        fontWeight: 'bold',
        textDecoration: 'underline',
        letterSpacing: '3px',
        margin: '0 0 18px 0',
      }}>
        สัญญาเช่าห้องพัก
      </h1>

      {/* ── ทำที่ / วันที่ (ชิดขวา เรียงซ้อน) ── */}
      <div style={{ textAlign: 'right', marginBottom: '14px' }}>
        <p style={{ margin: '0 0 2px 0' }}>ทำที่ <F>{settings.owner_address || D(25)}</F></p>
        <p style={{ margin: 0 }}>วันที่ <F>{thaiDate(signedDate)}</F></p>
      </div>

      {/* ── ผู้ให้เช่า ── */}
      <p style={p}>
        สัญญาฉบับนี้ทำขึ้นระหว่าง{' '}
        <F>{settings.owner_name || D(20)}</F>
        {settings.owner_id_card && <> เลขบัตรประชาชน <F>{settings.owner_id_card}</F></>}
        {' '}อยู่บ้านเลขที่ <F>{settings.owner_address || D(25)}</F>
        {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>&ldquo;ผู้ให้เช่า&rdquo;</strong> ฝ่ายหนึ่ง กับ
      </p>

      {/* ── ผู้เช่า (3 บรรทัด ชิดซ้าย) ── */}
      <p style={{ ...p, marginBottom: '2px' }}>
        <F>{tenant.full_name}</F>{' '}
        อยู่บ้านเลขที่ <F>{address || D(28)}</F>
      </p>
      <p style={{ ...p, marginBottom: '2px' }}>
        ถือบัตรประจำตัวประชาชนเลขที่ <F>{idCard || D(16)}</F>
        {' '}เบอร์โทรศัพท์ <F>{tenant.phone || D(14)}</F>
      </p>
      <p style={{ ...p, marginBottom: '14px' }}>
        ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>&ldquo;ผู้เช่า&rdquo;</strong> อีกฝ่ายหนึ่ง
      </p>

      <p style={p}>ทั้งสองฝ่ายตกลงทำสัญญากันมีข้อตกลงดังต่อไปนี้</p>

      {/* ── ข้อ 1 ── */}
      <p style={h}>ข้อ 1. วัตถุประสงค์แห่งสัญญา</p>
      <p style={p}>
        ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพัก เลขที่{' '}
        <F>{room?.room_number ?? D(6)}</F>
        {room?.floor != null
          ? <> ชั้นที่ <F>{room.floor}</F></>
          : <> ชั้นที่ <F>{D(4)}</F></>
        }
        {' '}ตั้งอยู่ที่ <F>{settings.owner_address || D(30)}</F>
        {' '}เพื่อใช้เป็นที่อยู่อาศัยเท่านั้น
      </p>

      {/* ── ข้อ 2 ── */}
      <p style={h}>ข้อ 2. กำหนดระยะเวลาเช่าและค่าเช่า</p>
      <p style={p}>
        คู่สัญญาตกลงกำหนดระยะเวลาเช่าแบบรายเดือน เริ่มตั้งแต่วันที่{' '}
        <F>{thaiShortDate(contract.start_date)}</F>
        {contract.end_date && (
          <> ถึงวันที่ <F>{thaiShortDate(contract.end_date)}</F></>
        )}
        {' '}โดยผู้เช่าตกลงชำระค่าเช่าในอัตราเดือนละ{' '}
        <F>{numTH(contract.monthly_rent)}</F> บาท
        {' '}และกำหนดชำระในวันที่ <F>{settings.due_day}</F> ของทุกเดือน
      </p>

      {/* ── ข้อ 3 ── */}
      <p style={h}>ข้อ 3. เงินประกันและการจ่ายล่วงหน้า</p>
      <p style={{ ...p, marginBottom: '2px' }}>
        ในวันทำสัญญานี้ ผู้เช่าได้ชำระเงินประกันให้แก่ผู้ให้เช่า ดังนี้
      </p>
      <p style={{ ...p, marginBottom: '2px', paddingLeft: '1em' }}>
        1) เงินประกันความเสียหายและประกันการเช่า เป็นจำนวนเงิน{' '}
        <F>{numTH(contract.deposit_paid)}</F> บาท
      </p>
      <p style={{ ...p, marginBottom: '4px', paddingLeft: '1em' }}>
        2) ค่าล่วงหน้า {D(6)} เดือน เป็นจำนวนเงิน {D(12)} บาท
      </p>
      <p style={p}>
        เงินประกันนี้ผู้ให้เช่าจะคืนให้แก่ผู้เช่าเมื่อสิ้นสุดสัญญาเช่า
        โดยหักค่าเสียหายหรือหนี้ค้างชำระ (ถ้ามี) ออกแล้ว
      </p>

      {/* ── ข้อ 4 ── */}
      <p style={h}>ข้อ 4. ค่าสาธารณูปโภค</p>
      <p style={p}>
        ผู้เช่าตกลงเป็นผู้ชำระค่าไฟฟ้า หน่วยละ{' '}
        <F>{numTH(settings.electricity_unit_price)}</F> บาท
        {' '}และค่าน้ำประปา หน่วยละ{' '}
        <F>{numTH(settings.water_unit_price)}</F> บาท
        {' '}ตามที่ได้ตกลงกัน
      </p>

      {/* ── ข้อ 5 ── */}
      <p style={h}>ข้อ 5. การรักษาความสงบและการดูแลรักษา</p>
      <p style={p}>
        ผู้เช่าสัญญาว่าจะไม่กระทำการใดๆ อันเป็นการกระทบกระเทือนหรือสร้างความเดือดร้อนรำคาญ
        แก่ผู้อยู่อาศัยข้างเคียง และจะดูแลรักษาห้องเช่าให้อยู่ในสภาพดีเสมอ
        หากเกิดความเสียหายที่เกิดจากความประมาทเลินเล่อของผู้เช่า
        ผู้เช่าต้องเป็นผู้รับผิดชอบค่าใช้จ่ายในการซ่อมแซม
      </p>

      </div>{/* end หน้า 1 */}

      {/* ── หน้า 2 (ข้อ 6 + ลายเซ็น) ── */}
      <div style={{ minHeight: '1123px', padding: '52px 56px', boxSizing: 'border-box' }}>

      {/* ── ข้อ 6 ── */}
      <p style={h}>ข้อ 6. การบอกเลิกสัญญา</p>
      <p style={{ ...p, marginBottom: '18px' }}>
        หากผู้เช่าผิดนัดชำระค่าเช่า หรือผิดสัญญาข้อหนึ่งข้อใด
        ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาและใช้สิทธิยึดครองห้องเช่าคืนได้ทันที
        ผู้เช่ามีสิทธิบอกเลิกสัญญาโดยแจ้งให้ผู้ให้เช่าทราบล่วงหน้าอย่างน้อย 30 วัน
      </p>

      <p style={{ ...p, marginBottom: '28px' }}>
        สัญญาฉบับนี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน
        คู่สัญญาได้อ่านและเข้าใจข้อความโดยละเอียดแล้ว
        จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน
      </p>

      {/* ── ลายเซ็น ── */}
      <div style={{ display: 'flex', gap: '32px' }}>
        {/* ผู้ให้เช่า */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ position: 'relative', height: '64px', marginBottom: '0' }}>
            {settings.owner_signature_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.owner_signature_url}
                alt="ลายเซ็นผู้ให้เช่า"
                style={{
                  position: 'absolute', bottom: '0', left: '50%',
                  transform: 'translateX(-50%)',
                  maxHeight: '60px', maxWidth: '180px', objectFit: 'contain',
                }}
              />
            ) : null}
          </div>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '2px', margin: '0 0 2px 0' }}>
            ลงชื่อ{D(18)}ผู้ให้เช่า
          </p>
          <p style={{ fontSize: '12px', margin: '0 0 2px 0' }}>(<F>{settings.owner_name || D(16)}</F>)</p>
          <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>วันที่ <F>{thaiDate(signedDate)}</F></p>
        </div>

        {/* ผู้เช่า */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ position: 'relative', height: '64px', marginBottom: '0' }}>
            {signatureDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureDataUrl}
                alt="ลายเซ็นผู้เช่า"
                style={{
                  position: 'absolute', bottom: '0', left: '50%',
                  transform: 'translateX(-50%)',
                  maxHeight: '60px', maxWidth: '180px', objectFit: 'contain',
                }}
              />
            ) : null}
          </div>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '2px', margin: '0 0 2px 0' }}>
            ลงชื่อ{D(18)}ผู้เช่า
          </p>
          <p style={{ fontSize: '12px', margin: '0 0 2px 0' }}>(<F>{tenant.full_name}</F>)</p>
          <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>วันที่ <F>{thaiDate(signedDate)}</F></p>
        </div>
      </div>

      {/* ── พยาน ── */}
      <div style={{ display: 'flex', gap: '32px', marginTop: '32px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '13px', margin: '0' }}>ลง</p>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '2px', margin: '0 0 2px 0' }}>
            ชื่อ{D(20)}พยาน
          </p>
          <p style={{ fontSize: '12px', margin: 0 }}>({D(16)})</p>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '13px', margin: '0' }}>ลง</p>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '2px', margin: '0 0 2px 0' }}>
            ชื่อ{D(20)}พยาน
          </p>
          <p style={{ fontSize: '12px', margin: 0 }}>({D(16)})</p>
        </div>
      </div>

      </div>{/* end หน้า 2 */}
    </div>
  )
}
