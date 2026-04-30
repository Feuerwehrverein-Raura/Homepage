package ch.fwvraura.members.ui.profile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.MemberProfile
import ch.fwvraura.members.data.model.MemberProfileUpdate
import ch.fwvraura.members.databinding.ActivityEditProfileBinding
import coil.load
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class EditProfileActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEditProfileBinding
    private val swissDate = SimpleDateFormat("dd.MM.yyyy", Locale.GERMAN).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val isoDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private var geburtstagIso: String? = null

    /** Tempfile fuer die Kamera-Aufnahme. Wird ueber den FileProvider als content:// URI uebergeben. */
    private var pendingCameraFile: File? = null

    private val cameraLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { taken ->
        val file = pendingCameraFile
        pendingCameraFile = null
        if (taken && file != null && file.exists()) {
            uploadPhotoFromUri(Uri.fromFile(file))
        } else {
            file?.delete()
        }
    }

    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) uploadPhotoFromUri(uri)
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startCameraCapture()
        else Snackbar.make(binding.root, "Kamera-Berechtigung abgelehnt.", Snackbar.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityEditProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.inputAnrede.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, listOf("Frau", "Herr", "Divers"))
        )

        binding.inputGeburtstag.setOnClickListener { showDatePicker() }
        binding.btnSave.setOnClickListener { save() }

        binding.btnPhotoCamera.setOnClickListener { launchCamera() }
        binding.btnPhotoGallery.setOnClickListener {
            galleryLauncher.launch(
                androidx.activity.result.PickVisualMediaRequest(
                    ActivityResultContracts.PickVisualMedia.ImageOnly
                )
            )
        }
        binding.btnPhotoDelete.setOnClickListener { confirmDeletePhoto() }

        loadProfile()
    }

    private fun loadProfile() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val profile = ApiModule.membersApi.getMe().body() ?: return@launch
                fillForm(profile)
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Fehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun fillForm(p: MemberProfile) {
        binding.inputAnrede.setText(p.anrede.orEmpty(), false)
        binding.inputVorname.setText(p.vorname.orEmpty())
        binding.inputNachname.setText(p.nachname.orEmpty())
        binding.inputEmail.setText(p.email.orEmpty())
        if (!p.geburtstag.isNullOrBlank()) {
            geburtstagIso = p.geburtstag.substring(0, minOf(10, p.geburtstag.length))
            try {
                val d = isoDate.parse(geburtstagIso!!)
                binding.inputGeburtstag.setText(swissDate.format(d ?: Date()))
            } catch (_: Exception) {
                binding.inputGeburtstag.setText(geburtstagIso)
            }
        }
        binding.inputMobile.setText(p.mobile.orEmpty())
        binding.inputTelefon.setText(p.telefon.orEmpty())
        binding.inputStrasse.setText(p.strasse.orEmpty())
        binding.inputPlz.setText(p.plz.orEmpty())
        binding.inputOrt.setText(p.ort.orEmpty())
        renderPhoto(p.foto)
    }

    private fun renderPhoto(rel: String?) {
        val full = rel?.let { if (it.startsWith("http")) it else "https://api.fwv-raura.ch$it" }
        if (!full.isNullOrBlank()) {
            binding.editProfilePhoto.load(full) {
                placeholder(R.drawable.ic_person)
                error(R.drawable.ic_person)
            }
            binding.btnPhotoDelete.isEnabled = true
        } else {
            binding.editProfilePhoto.setImageResource(R.drawable.ic_person)
            binding.btnPhotoDelete.isEnabled = false
        }
    }

    private fun showDatePicker() {
        val initialMs = geburtstagIso?.let {
            try { isoDate.parse(it)?.time } catch (_: Exception) { null }
        } ?: MaterialDatePicker.todayInUtcMilliseconds()

        val picker = MaterialDatePicker.Builder.datePicker()
            .setTitleText("Geburtstag")
            .setSelection(initialMs)
            .build()
        picker.addOnPositiveButtonClickListener { ms ->
            val date = Date(ms)
            geburtstagIso = isoDate.format(date)
            binding.inputGeburtstag.setText(swissDate.format(date))
        }
        picker.show(supportFragmentManager, "geburtstag_picker")
    }

    private fun launchCamera() {
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.CAMERA
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (granted) startCameraCapture()
        else cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
    }

    private fun startCameraCapture() {
        val dir = File(cacheDir, "photos").apply { mkdirs() }
        val file = File.createTempFile("capture_", ".jpg", dir)
        pendingCameraFile = file
        val uri = FileProvider.getUriForFile(this, "com.fwv.members.fileprovider", file)
        cameraLauncher.launch(uri)
    }

    private fun confirmDeletePhoto() {
        AlertDialog.Builder(this)
            .setTitle("Profilfoto entfernen?")
            .setMessage("Möchtest du dein Profilfoto wirklich löschen?")
            .setPositiveButton("Entfernen") { _, _ -> deletePhoto() }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun deletePhoto() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membersApi.deletePhoto()
                if (resp.isSuccessful) {
                    Snackbar.make(binding.root, "Profilfoto entfernt", Snackbar.LENGTH_SHORT).show()
                    renderPhoto(null)
                } else {
                    Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    /**
     * Bild von einer URI lesen, auf max. 1024×1024 herunterskalieren, mit JPEG 85% komprimieren
     * und als Multipart hochladen. Backend hat nur 5 MB Upload-Limit — Original-Photos vom Telefon
     * sind ohne Skalierung schnell darueber.
     */
    private fun uploadPhotoFromUri(uri: Uri) {
        binding.progress.visibility = View.VISIBLE
        binding.btnPhotoCamera.isEnabled = false
        binding.btnPhotoGallery.isEnabled = false
        lifecycleScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { downscaleToJpeg(uri) }
                val body = bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("photo", "profile.jpg", body)
                val resp = ApiModule.membersApi.uploadPhoto(part)
                if (resp.isSuccessful && resp.body()?.success == true) {
                    Snackbar.make(binding.root, "Profilfoto aktualisiert", Snackbar.LENGTH_SHORT).show()
                    renderPhoto(resp.body()?.photoUrl)
                } else {
                    Snackbar.make(binding.root, "Upload fehlgeschlagen (${resp.code()})", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Fehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                pendingCameraFile?.delete()
                pendingCameraFile = null
                binding.progress.visibility = View.GONE
                binding.btnPhotoCamera.isEnabled = true
                binding.btnPhotoGallery.isEnabled = true
            }
        }
    }

    private fun downscaleToJpeg(uri: Uri): ByteArray {
        val maxDim = 1024
        // Erst nur Dimensionen lesen (ohne das Bild zu dekodieren)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / sample > maxDim || bounds.outHeight / sample > maxDim) sample *= 2

        // Mit Sampling laden (spart Speicher)
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        var bmp = contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, opts)
        } ?: throw IllegalStateException("Bild konnte nicht gelesen werden")

        // Final auf maxDim skalieren falls noch zu gross
        val scale = minOf(1f, maxDim.toFloat() / maxOf(bmp.width, bmp.height))
        if (scale < 1f) {
            val w = (bmp.width * scale).toInt()
            val h = (bmp.height * scale).toInt()
            bmp = Bitmap.createScaledBitmap(bmp, w, h, true)
        }

        // EXIF-Orientation respektieren — sonst liegen Querformat-Aufnahmen falsch
        val rotation = readExifRotation(uri)
        if (rotation != 0) {
            val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
            bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
        }

        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
        return out.toByteArray()
    }

    private fun readExifRotation(uri: Uri): Int = try {
        contentResolver.openInputStream(uri)?.use { stream ->
            val exif = ExifInterface(stream)
            when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        } ?: 0
    } catch (_: Exception) { 0 }

    private fun save() {
        val update = MemberProfileUpdate(
            anrede = binding.inputAnrede.text?.toString()?.trim()?.ifBlank { null },
            vorname = binding.inputVorname.text?.toString()?.trim()?.ifBlank { null },
            nachname = binding.inputNachname.text?.toString()?.trim()?.ifBlank { null },
            email = binding.inputEmail.text?.toString()?.trim()?.ifBlank { null },
            geburtstag = geburtstagIso,
            mobile = binding.inputMobile.text?.toString()?.trim()?.ifBlank { null },
            telefon = binding.inputTelefon.text?.toString()?.trim()?.ifBlank { null },
            strasse = binding.inputStrasse.text?.toString()?.trim()?.ifBlank { null },
            plz = binding.inputPlz.text?.toString()?.trim()?.ifBlank { null },
            ort = binding.inputOrt.text?.toString()?.trim()?.ifBlank { null }
        )

        binding.progress.visibility = View.VISIBLE
        binding.btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.updateMe(update)
                if (response.isSuccessful) {
                    val tm = MembersApp.instance.tokenManager
                    response.body()?.let {
                        tm.userEmail = it.email
                        tm.userName = listOfNotNull(it.vorname, it.nachname).joinToString(" ").ifBlank { null }
                    }
                    Snackbar.make(binding.root, "Profil gespeichert", Snackbar.LENGTH_SHORT).show()
                    binding.root.postDelayed({ finish() }, 700)
                } else {
                    Snackbar.make(binding.root, "Fehler ${response.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.btnSave.isEnabled = true
            }
        }
    }
}
