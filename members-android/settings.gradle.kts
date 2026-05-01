pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        // Huawei AppGallery Connect Plugin (com.huawei.agconnect)
        maven { url = uri("https://developer.huawei.com/repo/") }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Huawei HMS-Artefakte (com.huawei.hms:push, agconnect-core, …)
        maven { url = uri("https://developer.huawei.com/repo/") }
    }
}

rootProject.name = "FWV Raura"
include(":app")
