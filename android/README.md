# ห้องเช่าป้านันท์ — Android App

WebView wrapper สำหรับ [rental-v2.joteboony.workers.dev](https://rental-v2.joteboony.workers.dev)

## ความต้องการระบบ

| รายการ | เวอร์ชัน |
|--------|---------|
| Android Studio | Hedgehog (2023.1.1) ขึ้นไป |
| JDK | 17 ขึ้นไป |
| Android SDK | compileSdk 34 |
| minSdk | 24 (Android 7.0) |

---

## วิธี Build APK

### วิธีที่ 1 — Android Studio (แนะนำ)

1. เปิด Android Studio → **Open** → เลือกโฟลเดอร์ `android/`
2. รอ Gradle sync เสร็จ (ครั้งแรกใช้เวลาสักครู่)
3. เลือก build variant:
   - **debug** — ทดสอบในเครื่อง
   - **release** — ติดตั้งจริง (ต้อง sign ก่อน)
4. ไปที่ **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. APK อยู่ที่: `app/build/outputs/apk/debug/app-debug.apk`

### วิธีที่ 2 — Command Line

```bash
cd android

# macOS / Linux
./gradlew assembleDebug

# Windows
gradlew.bat assembleDebug
```

APK อยู่ที่: `app/build/outputs/apk/debug/app-debug.apk`

---

## วิธีสร้าง Release APK (สำหรับแจกจ่าย)

### 1. สร้าง Keystore (ทำครั้งเดียว)

```bash
keytool -genkey -v \
  -keystore pananth-release.jks \
  -alias pananth \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### 2. เพิ่ม signing config ใน `app/build.gradle.kts`

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("../pananth-release.jks")
            storePassword = "YOUR_STORE_PASSWORD"
            keyAlias = "pananth"
            keyPassword = "YOUR_KEY_PASSWORD"
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            // ...
        }
    }
}
```

### 3. Build

```bash
./gradlew assembleRelease
```

APK อยู่ที่: `app/build/outputs/apk/release/app-release.apk`

---

## วิธีติดตั้งในมือถือ Android

### วิธีที่ 1 — ADB (ต่อสาย USB)

```bash
# เปิด USB Debugging ในมือถือก่อน (Settings → Developer Options)
adb install app/build/outputs/apk/debug/app-debug.apk
```

### วิธีที่ 2 — ส่งไฟล์โดยตรง

1. คัดลอกไฟล์ `.apk` ไปยังมือถือ (ผ่าน USB / Google Drive / LINE)
2. เปิดไฟล์ใน File Manager
3. อนุญาต **"ติดตั้งจากแหล่งที่ไม่รู้จัก"** ถ้าระบบถาม
4. กด **ติดตั้ง**

---

## ฟีเจอร์

- เปิดเว็บแบบเต็มจอ (no address bar)
- รองรับ JavaScript และ DOM Storage
- อัปโหลดรูปสลิป / มิเตอร์ด้วยกล้องหรือ gallery
- ปุ่ม Back ย้อนหน้าเว็บ / ออกจากแอปถ้าย้อนไม่ได้
- Splash screen ไอคอนบ้านสีเขียว
- แสดงหน้า error ภาษาไทยเมื่อไม่มีอินเทอร์เน็ต
- ลิงก์ภายนอกเปิดใน browser

## Permissions

| Permission | เหตุผล |
|-----------|--------|
| INTERNET | เชื่อมต่อเว็บ |
| CAMERA | ถ่ายรูปสลิป/มิเตอร์ |
| READ_MEDIA_IMAGES | เลือกรูปจาก gallery (Android 13+) |
| READ_EXTERNAL_STORAGE | เลือกรูปจาก gallery (Android ≤12) |
