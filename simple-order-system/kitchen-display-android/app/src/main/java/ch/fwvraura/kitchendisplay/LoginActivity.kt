package ch.fwvraura.kitchendisplay

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.preference.PreferenceManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.CircularProgressIndicator
import com.google.android.material.textfield.TextInputEditText
import com.google.gson.Gson
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class LoginActivity : AppCompatActivity() {

    private lateinit var passwordInput: TextInputEditText
    private lateinit var loginButton: MaterialButton
    private lateinit var errorText: TextView
    private lateinit var loadingIndicator: CircularProgressIndicator
    private lateinit var tokenManager: TokenManager

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenManager = TokenManager(this)

        // Already logged in?
        if (tokenManager.isLoggedIn()) {
            startMainActivity()
            return
        }

        setContentView(R.layout.activity_login)

        passwordInput = findViewById(R.id.passwordInput)
        loginButton = findViewById(R.id.loginButton)
        errorText = findViewById(R.id.errorText)
        loadingIndicator = findViewById(R.id.loadingIndicator)

        loginButton.setOnClickListener { doLogin() }

        passwordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                doLogin()
                true
            } else false
        }
    }

    private fun doLogin() {
        val password = passwordInput.text?.toString()?.trim() ?: ""
        if (password.isEmpty()) {
            errorText.text = getString(R.string.error_empty_password)
            errorText.visibility = View.VISIBLE
            return
        }

        errorText.visibility = View.GONE
        loginButton.isEnabled = false
        loadingIndicator.visibility = View.VISIBLE

        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { login(password) }
                if (result != null) {
                    tokenManager.saveToken(result)
                    startMainActivity()
                } else {
                    errorText.text = getString(R.string.error_wrong_password)
                    errorText.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                errorText.text = getString(R.string.error_connection)
                errorText.visibility = View.VISIBLE
            } finally {
                loginButton.isEnabled = true
                loadingIndicator.visibility = View.GONE
            }
        }
    }

    private fun login(password: String): String? {
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val serverUrl = prefs.getString("server_url", getString(R.string.default_server_url))
            ?: getString(R.string.default_server_url)

        val json = gson.toJson(mapOf("password" to password))
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/auth/login")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) return null

        val body = response.body?.string() ?: return null
        val map = gson.fromJson(body, Map::class.java)
        return map["token"] as? String
    }

    private fun startMainActivity() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
