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

export function AgreementTemplate({ data, signatureDataUrl, idCard, address, signedDate }: Props) {
  const { tenant, contract, settings } = data
  const room = contract.room

  return (
    <div
      id="agreement-template"
      style={{
        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
        fontSize: '14px',
        lineHeight: '1.8',
        color: '#000',
        backgroundColor: '#fff',
        padding: '48px',
        width: '794px',
        minHeight: '1123px',
        boxSizing: 'border-box',
      }}
    >
      {/* Page 1 */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', letterSpacing: '2px' }}>
          สัญญาเช่าห้องพัก
        </h1>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span>กำที่ {settings.owner_address}</span>
          <span>วันที่ {thaiDate(signedDate)}</span>
        </div>

        <p style={{ marginBottom: '12px' }}>
          สัญญาฉบับนี้ทำขึ้นระหว่าง <strong>{settings.owner_name}</strong>
          {settings.owner_id_card && <> เลขบัตรประชาชน {settings.owner_id_card}</>}
          {' '}อยู่บ้านเลขที่ {settings.owner_address}
          {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้ให้เช่า"</strong> ฝ่ายหนึ่ง กับ
        </p>

        <p style={{ marginBottom: '16px' }}>
          <strong>{tenant.full_name}</strong>
          {idCard && <> เลขบัตรประชาชน {idCard}</>}
          {tenant.phone && <> เบอร์โทรศัพท์ {tenant.phone}</>}
          {address && <> ที่อยู่ {address}</>}
          {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้เช่า"</strong> อีกฝ่ายหนึ่ง
        </p>

        <p style={{ marginBottom: '20px' }}>
          ทั้งสองฝ่ายตกลงทำสัญญากันมีข้อตกลงดังต่อไปนี้
        </p>

        {/* ข้อ 1 */}
        <p style={{ marginBottom: '8px' }}><strong>ข้อ 1. วัตถุประสงค์แห่งสัญญา</strong></p>
        <p style={{ marginBottom: '16px', paddingLeft: '16px' }}>
          ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพัก เลขที่{' '}
          <strong>{room?.room_number ?? '—'}</strong>
          {room?.floor != null && <> ชั้นที่ <strong>{room.floor}</strong></>}
          {' '}ตั้งอยู่ที่ {settings.owner_address}
          {' '}เพื่อใช้เป็นที่อยู่อาศัยเท่านั้น
        </p>

        {/* ข้อ 2 */}
        <p style={{ marginBottom: '8px' }}><strong>ข้อ 2. กำหนดระยะเวลาเช่า</strong></p>
        <p style={{ marginBottom: '16px', paddingLeft: '16px' }}>
          คู่สัญญาตกลงกำหนดระยะเวลาเช่าแบบรายเดือน เริ่มตั้งแต่วันที่{' '}
          <strong>{thaiShortDate(contract.start_date)}</strong>
          {contract.end_date && (
            <> ถึงวันที่ <strong>{thaiShortDate(contract.end_date)}</strong></>
          )}
          {' '}โดยผู้เช่าจะต้องชำระค่าเช่าเดือนละ{' '}
          <strong>{numTH(contract.monthly_rent)}</strong> บาท ในทุก ๆ เดือน
        </p>

        {/* ข้อ 3 */}
        <p style={{ marginBottom: '8px' }}><strong>ข้อ 3. เงินประกันและการรักษาทรัพย์สิน</strong></p>
        <p style={{ marginBottom: '4px', paddingLeft: '16px' }}>
          ในวันทำสัญญานี้ ผู้เช่าได้ชำระเงินประกันให้แก่ผู้ให้เช่า ดังนี้
        </p>
        <p style={{ paddingLeft: '32px', marginBottom: '4px' }}>
          1) เงินประกันความเสียหาย เป็นจำนวนเงิน <strong>{numTH(contract.deposit_paid)}</strong> บาท
        </p>
        <p style={{ paddingLeft: '16px', marginBottom: '16px' }}>
          เงินดังกล่าวผู้ให้เช่าจะคืนให้แก่ผู้เช่าเมื่อสิ้นสุดสัญญาเช่า
          โดยหักค่าเสียหาย (ถ้ามี) ออกแล้ว
        </p>

        {/* ข้อ 4 */}
        <p style={{ marginBottom: '8px' }}><strong>ข้อ 4. ค่าสาธารณูปโภค</strong></p>
        <p style={{ marginBottom: '16px', paddingLeft: '16px' }}>
          ผู้เช่าตกลงชำระค่าไฟฟ้า หน่วยละ{' '}
          <strong>{numTH(settings.electricity_unit_price)}</strong> บาท
          {' '}และค่าน้ำประปา หน่วยละ{' '}
          <strong>{numTH(settings.water_unit_price)}</strong> บาท
          {' '}ตามที่ตกลงกัน
        </p>

        {/* ข้อ 5 */}
        <p style={{ marginBottom: '8px' }}><strong>ข้อ 5. การรักษาความสงบและการดูแลรักษา</strong></p>
        <p style={{ marginBottom: '16px', paddingLeft: '16px' }}>
          ผู้เช่าตกลงปฏิบัติตามกฎระเบียบ ข้อบังคับ และกติกาของสถานที่พักอาศัย
          รักษาห้องพักให้สะอาดและอยู่ในสภาพที่ดีเสมอ
          และไม่ก่อความรำคาญหรือความเดือดร้อนให้แก่ผู้อาศัยอื่น
        </p>
      </div>

      {/* Page break */}
      <div style={{ borderTop: '1px dashed #ccc', margin: '32px 0', paddingTop: '8px' }}>
        <p style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>— หน้า 2 จาก 2 —</p>
      </div>

      {/* Page 2 */}
      <div>
        {/* ข้อ 6 */}
        <p style={{ marginBottom: '8px' }}><strong>ข้อ 6. การบอกเลิกสัญญา</strong></p>
        <p style={{ marginBottom: '24px', paddingLeft: '16px' }}>
          หากผู้เช่าผิดนัดชำระค่าเช่า หรือผิดสัญญาข้อหนึ่งข้อใด
          ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาและใช้สิทธิครอบครองห้องเช่าคืนได้ทันที
          ผู้เช่ามีสิทธิบอกเลิกสัญญาโดยแจ้งให้ผู้ให้เช่าทราบล่วงหน้าอย่างน้อย 30 วัน
        </p>

        <p style={{ marginBottom: '32px' }}>
          สัญญาฉบับนี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน
          คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว
          จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน
        </p>

        {/* Signature section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', gap: '32px' }}>
          {/* ผู้ให้เช่า */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              borderBottom: '1px solid #000',
              height: '60px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '12px', color: '#555' }}>ลงชื่อ.................................</span>
            </div>
            <p style={{ fontSize: '13px' }}>ผู้ให้เช่า</p>
            <p style={{ fontSize: '12px', color: '#555' }}>({settings.owner_name})</p>
            <p style={{ fontSize: '12px', color: '#777' }}>วันที่ {thaiDate(signedDate)}</p>
          </div>

          {/* ผู้เช่า */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              borderBottom: '1px solid #000',
              height: '60px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              position: 'relative',
            }}>
              {signatureDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureDataUrl}
                  alt="ลายเซ็น"
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    maxHeight: '56px',
                    maxWidth: '160px',
                    objectFit: 'contain',
                  }}
                />
              )}
            </div>
            <p style={{ fontSize: '13px' }}>ผู้เช่า</p>
            <p style={{ fontSize: '12px', color: '#555' }}>({tenant.full_name})</p>
            <p style={{ fontSize: '12px', color: '#777' }}>วันที่ {thaiDate(signedDate)}</p>
          </div>
        </div>

        {/* Witnesses */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', gap: '32px' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', height: '40px', marginBottom: '8px' }} />
            <p style={{ fontSize: '12px', color: '#555' }}>ลงชื่อ.................................พยาน</p>
            <p style={{ fontSize: '12px', color: '#777' }}>(........................)</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', height: '40px', marginBottom: '8px' }} />
            <p style={{ fontSize: '12px', color: '#555' }}>ลงชื่อ.................................พยาน</p>
            <p style={{ fontSize: '12px', color: '#777' }}>(........................)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
