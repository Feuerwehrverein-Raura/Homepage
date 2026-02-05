package ch.fwvraura.vorstand

import android.app.Application
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.util.TokenManager

class VorstandApp : Application() {

    lateinit var tokenManager: TokenManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        tokenManager = TokenManager(this)
        ApiModule.init(tokenManager)
    }

    companion object {
        lateinit var instance: VorstandApp
            private set
    }
}
