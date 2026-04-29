package ch.fwvraura.members

import android.app.Application
import ch.fwvraura.members.util.TokenManager

class MembersApp : Application() {
    lateinit var tokenManager: TokenManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        tokenManager = TokenManager(this)
    }

    companion object {
        lateinit var instance: MembersApp
            private set
    }
}
