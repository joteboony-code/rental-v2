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
        padding: '52px 56px',
        width: '794px',
        minHeight: '1123px',
        boxSizing: 'border-box',
      }}
    >
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

      {/* ── ทำที่ / วันที่ ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span>ทำที่ {settings.owner_address || D(30)}</span>
        <span>วันที่ {thaiDate(signedDate)}</span>
      </div>

      {/* ── ผู้ให้เช่า ── */}
      <p style={p}>
        สัญญาฉบับนี้ทำขึ้นระหว่าง{' '}
        <strong>{settings.owner_name || D(20)}</strong>
        {settings.owner_id_card && <> เลขบัตรประชาชน {settings.owner_id_card}</>}
        {' '}อยู่บ้านเลขที่ {settings.owner_address || D(25)}
        {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>&ldquo;ผู้ให้เช่า&rdquo;</strong> ฝ่ายหนึ่ง กับ
      </p>

      {/* ── ผู้เช่า (3 บรรทัด ชิดซ้าย) ── */}
      <p style={{ ...p, marginBottom: '2px' }}>
        <strong>{tenant.full_name}</strong>{' '}
        อยู่บ้านเลขที่ {address || D(28)}
      </p>
      <p style={{ ...p, marginBottom: '2px' }}>
        ถือบัตรประจำตัวประชาชนเลขที่ {idCard || D(16)}
        {' '}เบอร์โทรศัพท์ {tenant.phone || D(14)}
      </p>
      <p style={{ ...p, marginBottom: '14px' }}>
        ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>&ldquo;ผู้เช่า&rdquo;</strong> อีกฝ่ายหนึ่ง
      </p>

      <p style={p}>ทั้งสองฝ่ายตกลงทำสัญญากันมีข้อตกลงดังต่อไปนี้</p>

      {/* ── ข้อ 1 ── */}
      <p style={h}>ข้อ 1. วัตถุประสงค์แห่งสัญญา</p>
      <p style={p}>
        ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพัก เลขที่{' '}
        <strong>{room?.room_number ?? D(6)}</strong>
        {room?.floor != null
          ? <> ชั้นที่ <strong>{room.floor}</strong></>
          : <> ชั้นที่ {D(4)}</>
        }
        {' '}ตั้งอยู่ที่ {settings.owner_address || D(30)}
        {' '}เพื่อใช้เป็นที่อยู่อาศัยเท่านั้น
      </p>

      {/* ── ข้อ 2 ── */}
      <p style={h}>ข้อ 2. กำหนดระยะเวลาเช่าและค่าเช่า</p>
      <p style={p}>
        คู่สัญญาตกลงกำหนดระยะเวลาเช่าแบบรายเดือน เริ่มตั้งแต่วันที่{' '}
        <strong>{thaiShortDate(contract.start_date)}</strong>
        {contract.end_date && (
          <> ถึงวันที่ <strong>{thaiShortDate(contract.end_date)}</strong></>
        )}
        {' '}โดยผู้เช่าตกลงชำระค่าเช่าในอัตราเดือนละ{' '}
        <strong>{numTH(contract.monthly_rent)}</strong> บาท
        {' '}และกำหนดชำระในวันที่ {D(6)} ของทุกเดือน
      </p>

      {/* ── ข้อ 3 ── */}
      <p style={h}>ข้อ 3. เงินประกันและการจ่ายล่วงหน้า</p>
      <p style={{ ...p, marginBottom: '2px' }}>
        ในวันทำสัญญานี้ ผู้เช่าได้ชำระเงินประกันให้แก่ผู้ให้เช่า ดังนี้
      </p>
      <p style={{ ...p, marginBottom: '2px', paddingLeft: '1em' }}>
        1) เงินประกันความเสียหายและประกันการเช่า เป็นจำนวนเงิน{' '}
        <strong>{numTH(contract.deposit_paid)}</strong> บาท
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
        <strong>{numTH(settings.electricity_unit_price)}</strong> บาท
        {' '}และค่าน้ำประปา หน่วยละ{' '}
        <strong>{numTH(settings.water_unit_price)}</strong> บาท
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

      {/* ── ตัวคั่นหน้า ── */}
      <div style={{ margin: '20px 0 18px', textAlign: 'center', color: '#aaa', fontSize: '12px', letterSpacing: '2px' }}>
        — หน้า 2 จาก 2 —
      </div>

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
          <p style={{ fontSize: '12px', margin: '0 0 2px 0' }}>({settings.owner_name || D(16)})</p>
          <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>วันที่ {thaiDate(signedDate)}</p>
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
          <p style={{ fontSize: '12px', margin: '0 0 2px 0' }}>({tenant.full_name})</p>
          <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>วันที่ {thaiDate(signedDate)}</p>
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
    </div>
  )
}
