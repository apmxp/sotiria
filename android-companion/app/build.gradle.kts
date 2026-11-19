plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val pairingApiBaseUrl = providers.gradleProperty("sotiriaPairingApiBaseUrl")
    .orElse(providers.environmentVariable("SOTIRIA_PAIRING_API_BASE_URL"))
    .getOrElse("")
val escapedPairingApiBaseUrl = pairingApiBaseUrl
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")

android {
    namespace = "com.sotiria.companion"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.sotiria.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "PAIRING_API_BASE_URL", "\"$escapedPairingApiBaseUrl\"")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
