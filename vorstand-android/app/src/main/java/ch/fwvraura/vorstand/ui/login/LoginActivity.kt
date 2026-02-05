package ch.fwvraura.vorstand.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val viewModel: LoginViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Skip login if already authenticated
        if (VorstandApp.instance.tokenManager.isLoggedIn) {
            navigateToMain()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupUI()
        observeState()
    }

    private fun setupUI() {
        binding.loginButton.setOnClickListener {
            doLogin()
        }

        binding.passwordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                doLogin()
                true
            } else false
        }
    }

    private fun doLogin() {
        val email = binding.emailInput.text.toString().trim()
        val password = binding.passwordInput.text.toString()
        viewModel.login(email, password)
    }

    private fun observeState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loginState.collect { state ->
                    when (state) {
                        is LoginViewModel.LoginState.Idle -> {
                            binding.loginProgress.visibility = View.GONE
                            binding.errorText.visibility = View.GONE
                            binding.loginButton.isEnabled = true
                        }
                        is LoginViewModel.LoginState.Loading -> {
                            binding.loginProgress.visibility = View.VISIBLE
                            binding.errorText.visibility = View.GONE
                            binding.loginButton.isEnabled = false
                        }
                        is LoginViewModel.LoginState.Success -> {
                            navigateToMain()
                        }
                        is LoginViewModel.LoginState.Error -> {
                            binding.loginProgress.visibility = View.GONE
                            binding.errorText.text = state.message
                            binding.errorText.visibility = View.VISIBLE
                            binding.loginButton.isEnabled = true
                        }
                    }
                }
            }
        }
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
