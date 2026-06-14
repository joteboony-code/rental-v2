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

const dots = (n = 20) => '.'.repeat(n)

export function AgreementTemplate({ data, signatureDataUrl, idCard, address, signedDate }: Props) {
  const { tenant, contract, settings } = data
  const room = contract.room

  const sigLineStyle: React.CSSProperties = {
    position: 'relative',
    height: '64px',
    marginBottom: '4px',
  }
  const sigImgStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '0px',
    left: '50%',
    transform: 'translateX(-50%)',
    maxHeight: '60px',
    maxWidth: '180px',
    objectFit: 'contain',
  }

  return (
    <div
      id="agreement-template"
      style={{
        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
        fontSize: '14px',
        lineHeight: '1.9',
        color: '#000',
        backgroundColor: '#fff',
        padding: '56px 60px',
        width: '794px',
        minHeight: '1123px',
        boxSizing: 'border-box',
      }}
    >
      {/* ─── หน้า 1 ─── */}

      {/* ชื่อเรื่อง */}
      <h1 style={{
        textAlign: 'center',
        fontSize: '18px',
        fontWeight: 'bold',
        textDecoration: 'underline',
        letterSpacing: '4px',
        marginBottom: '20px',
      }}>
        สัญญาเช่าห้องพัก
      </h1>

      {/* ทำที่ / วันที่ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px' }}>
        <span>ทำที่ {settings.owner_address || dots(30)}</span>
        <span>วันที่ {thaiDate(signedDate)}</span>
      </div>

      {/* ฝ่ายผู้ให้เช่า */}
      <p style={{ marginBottom: '8px', textIndent: '2em' }}>
        สัญญาฉบับนี้ทำขึ้นระหว่าง{' '}
        <strong>{settings.owner_name || dots(20)}</strong>
        {settings.owner_id_card && <> เลขบัตรประชาชน {settings.owner_id_card}</>}
        {' '}อยู่บ้านเลขที่ {settings.owner_address || dots(25)}
        {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>&ldquo;ผู้ให้เช่า&rdquo;</strong> ฝ่ายหนึ่ง กับ
      </p>

      {/* ฝ่ายผู้เช่า */}
      <p style={{ marginBottom: '2px', paddingLeft: '2em' }}>
        <strong>{tenant.full_name}</strong>
      </p>
      <p style={{ marginBottom: '2px', paddingLeft: '2em' }}>
        อยู่บ้านเลขที่ {address || dots(30)}
      </p>
      <p style={{ marginBottom: '2px', paddingLeft: '2em' }}>
        ถือบัตรประจำตัวประชาชนเลขที่ {idCard || dots(18)}
        {tenant.phone
          ? <> เบอร์โทรศัพท์ {tenant.phone}</>
          : <> เบอร์โทรศัพท์ {dots(15)}</>
        }
      </p>
      <p style={{ marginBottom: '16px', paddingLeft: '2em' }}>
        ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>&ldquo;ผู้เช่า&rdquo;</strong> อีกฝ่ายหนึ่ง
      </p>

      <p style={{ marginBottom: '16px', textIndent: '2em' }}>
        ทั้งสองฝ่ายตกลงทำสัญญากันมีข้อตกลงดังต่อไปนี้
      </p>

      {/* ข้อ 1 */}
      <p style={{ marginBottom: '4px', fontWeight: 'bold' }}>ข้อ 1. วัตถุประสงค์แห่งสัญญา</p>
      <p style={{ marginBottom: '14px', paddingLeft: '1.5em' }}>
        ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพัก เลขที่{' '}
        <strong>{room?.room_number ?? dots(6)}</strong>
        {room?.floor != null
          ? <> ชั้นที่ <strong>{room.floor}</strong></>
          : <> ชั้นที่ {dots(4)}</>
        }
        {' '}ตั้งอยู่ที่ {settings.owner_address || dots(30)}
        {' '}เพื่อใช้เป็นที่อยู่อาศัยเท่านั้น
      </p>

      {/* ข้อ 2 */}
      <p style={{ marginBottom: '4px', fontWeight: 'bold' }}>ข้อ 2. กำหนดระยะเวลาเช่าและค่าเช่า</p>
      <p style={{ marginBottom: '14px', paddingLeft: '1.5em' }}>
        คู่สัญญาตกลงกำหนดระยะเวลาเช่าแบบรายเดือน เริ่มตั้งแต่วันที่{' '}
        <strong>{thaiShortDate(contract.start_date)}</strong>
        {contract.end_date && (
          <> ถึงวันที่ <strong>{thaiShortDate(contract.end_date)}</strong></>
        )}
        {' '}โดยผู้เช่าจะต้องชำระค่าเช่าเดือนละ{' '}
        <strong>{numTH(contract.monthly_rent)}</strong> บาท
        {' '}และกำหนดชำระในวันที่ {dots(6)} ของทุกเดือน
      </p>

      {/* ข้อ 3 */}
      <p style={{ marginBottom: '4px', fontWeight: 'bold' }}>ข้อ 3. เงินประกันและการจ่ายล่วงหน้า</p>
      <p style={{ marginBottom: '4px', paddingLeft: '1.5em' }}>
        ในวันทำสัญญานี้ ผู้เช่าได้ชำระเงินประกันให้แก่ผู้ให้เช่า ดังนี้
      </p>
      <p style={{ marginBottom: '4px', paddingLeft: '3em' }}>
        1) เงินประกันความเสียหายและประกันการเช่า เป็นจำนวนเงิน{' '}
        <strong>{numTH(contract.deposit_paid)}</strong> บาท
      </p>
      <p style={{ marginBottom: '4px', paddingLeft: '3em' }}>
        2) ค่าล่วงหน้า {dots(6)} เดือน เป็นจำนวนเงิน {dots(12)} บาท
      </p>
      <p style={{ marginBottom: '14px', paddingLeft: '1.5em' }}>
        เงินดังกล่าวผู้ให้เช่าจะคืนให้แก่ผู้เช่าเมื่อสิ้นสุดสัญญาเช่า
        โดยหักค่าเสียหายหรือหนี้ค้างชำระ (ถ้ามี) ออกแล้ว
      </p>

      {/* ข้อ 4 */}
      <p style={{ marginBottom: '4px', fontWeight: 'bold' }}>ข้อ 4. ค่าสาธารณูปโภค</p>
      <p style={{ marginBottom: '14px', paddingLeft: '1.5em' }}>
        ผู้เช่าตกลงเป็นผู้ชำระค่าไฟฟ้า หน่วยละ{' '}
        <strong>{numTH(settings.electricity_unit_price)}</strong> บาท
        {' '}และค่าน้ำประปา หน่วยละ{' '}
        <strong>{numTH(settings.water_unit_price)}</strong> บาท
        {' '}ตามที่ได้ตกลงกัน
      </p>

      {/* ข้อ 5 */}
      <p style={{ marginBottom: '4px', fontWeight: 'bold' }}>ข้อ 5. การรักษาความสงบและการดูแลรักษา</p>
      <p style={{ marginBottom: '14px', paddingLeft: '1.5em' }}>
        ผู้เช่าสัญญาว่าจะไม่กระทำการใดๆ อันเป็นการกระทบกระเทือนหรือสร้างความเดือดร้อนรำคาญ
        แก่ผู้อยู่อาศัยข้างเคียง และจะดูแลรักษาห้องเช่าให้อยู่ในสภาพดีเสมอ
        หากเกิดความเสียหายที่เกิดจากความประมาทเลินเล่อของผู้เช่า
        ผู้เช่าต้องเป็นผู้รับผิดชอบค่าใช้จ่ายในการซ่อมแซม
      </p>

      {/* ─── ตัวคั่นหน้า ─── */}
      <div style={{ margin: '24px 0 20px', textAlign: 'center', color: '#aaa', fontSize: '12px', letterSpacing: '2px' }}>
        — หน้า 2 จาก 2 —
      </div>

      {/* ─── หน้า 2 ─── */}

      {/* ข้อ 6 */}
      <p style={{ marginBottom: '4px', fontWeight: 'bold' }}>ข้อ 6. การบอกเลิกสัญญา</p>
      <p style={{ marginBottom: '20px', paddingLeft: '1.5em' }}>
        หากผู้เช่าผิดนัดชำระค่าเช่า หรือผิดสัญญาข้อหนึ่งข้อใด
        ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาและใช้สิทธิยึดครองห้องเช่าคืนได้ทันที
        ผู้เช่ามีสิทธิบอกเลิกสัญญาโดยแจ้งให้ผู้ให้เช่าทราบล่วงหน้าอย่างน้อย 30 วัน
      </p>

      <p style={{ marginBottom: '28px', textIndent: '2em' }}>
        สัญญาฉบับนี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน
        คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยละเอียดแล้ว
        จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน
      </p>

      {/* ─── ลายเซ็น ─── */}
      <div style={{ display: 'flex', gap: '40px', marginTop: '16px' }}>

        {/* ผู้ให้เช่า */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={sigLineStyle}>
            {settings.owner_signature_url
              ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.owner_signature_url} alt="ลายเซ็นผู้ให้เช่า" style={sigImgStyle} />
              )
              : (
                <span style={{ position: 'absolute', bottom: '0', left: 0, right: 0, textAlign: 'center', fontSize: '13px', color: '#444' }}>
                  ลงชื่อ{dots(22)}
                </span>
              )
            }
          </div>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '4px', marginBottom: '2px' }}>ผู้ให้เช่า</p>
          <p style={{ fontSize: '12px', color: '#333', marginBottom: '2px' }}>({settings.owner_name || dots(16)})</p>
          <p style={{ fontSize: '12px', color: '#555' }}>วันที่ {thaiDate(signedDate)}</p>
        </div>

        {/* ผู้เช่า */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={sigLineStyle}>
            {signatureDataUrl
              ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureDataUrl} alt="ลายเซ็นผู้เช่า" style={sigImgStyle} />
              )
              : (
                <span style={{ position: 'absolute', bottom: '0', left: 0, right: 0, textAlign: 'center', fontSize: '13px', color: '#444' }}>
                  ลงชื่อ{dots(22)}
                </span>
              )
            }
          </div>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '4px', marginBottom: '2px' }}>ผู้เช่า</p>
          <p style={{ fontSize: '12px', color: '#333', marginBottom: '2px' }}>({tenant.full_name})</p>
          <p style={{ fontSize: '12px', color: '#555' }}>วันที่ {thaiDate(signedDate)}</p>
        </div>
      </div>

      {/* ─── พยาน ─── */}
      <div style={{ display: 'flex', gap: '40px', marginTop: '36px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '13px', marginBottom: '0' }}>ลง</p>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '4px', marginBottom: '4px' }}>
            ชื่อ{dots(20)}พยาน
          </p>
          <p style={{ fontSize: '12px', color: '#555' }}>({dots(18)})</p>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '13px', marginBottom: '0' }}>ลง</p>
          <p style={{ fontSize: '13px', borderTop: '1px solid #000', paddingTop: '4px', marginBottom: '4px' }}>
            ชื่อ{dots(20)}พยาน
          </p>
          <p style={{ fontSize: '12px', color: '#555' }}>({dots(18)})</p>
        </div>
      </div>
    </div>
  )
}
