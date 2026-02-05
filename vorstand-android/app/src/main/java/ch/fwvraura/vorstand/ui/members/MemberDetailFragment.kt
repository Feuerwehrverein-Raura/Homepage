package ch.fwvraura.vorstand.ui.members

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.databinding.FragmentMemberDetailBinding
import ch.fwvraura.vorstand.util.DateUtils
import coil.load
import coil.request.CachePolicy
import coil.transform.CircleCropTransformation
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

/**
 * MemberDetailFragment — Detail-Ansicht eines einzelnen Mitglieds.
 *
 * Zeigt alle Informationen eines Mitglieds an: Foto, Name, Funktion, Kontaktdaten
 * (E-Mail, Telefon, Mobile), Adresse, Status, Geburtstag und Eintrittsdatum.
 *
 * Bietet folgende Aktionen:
 * - Foto aendern: Aus Galerie waehlen, mit Kamera aufnehmen, oder bestehendes Foto loeschen
 * - Mitglied bearbeiten: Navigation zum Formular (MemberFormFragment)
 * - Mitglied loeschen: Mit Bestaetigungsdialog
 */
class MemberDetailFragment : Fragment() {

    /**
     * View-Binding: Siehe MembersListFragment fuer eine ausfuehrliche Erklaerung
     * des _binding / binding Null-Safety-Patterns.
     */
    private var _binding: FragmentMemberDetailBinding? = null
    private val binding get() = _binding!!

    /** Die ID des angezeigten Mitglieds, wird aus den Fragment-Arguments gelesen. */
    private var memberId: String? = null

    /** Das aktuell geladene Member-Objekt, null bis die Daten geladen wurden. */
    private var member: Member? = null

    /**
     * URI des Kamera-Fotos. Wird vor dem Start der Kamera gesetzt und nach dem
     * Aufnehmen zum Upload verwendet. Muss als Instanzvariable gespeichert werden,
     * da der cameraLauncher-Callback die URI benoetigt, aber nicht als Parameter erhaelt.
     */
    private var cameraUri: Uri? = null

    /**
     * galleryLauncher — ActivityResultContract fuer die Galerie-Auswahl.
     *
     * ActivityResultContracts sind die moderne API fuer Activity-Ergebnisse und ersetzen
     * das veraltete onActivityResult(). Vorteile:
     * - Typsicher: Jeder Contract definiert seinen Input- und Output-Typ.
     * - Lifecycle-aware: Wird automatisch mit dem Fragment-Lifecycle verknuepft.
     * - Kein Request-Code noetig: Jeder Launcher ist direkt mit seinem Callback verbunden.
     *
     * PickVisualMedia: Oeffnet den System-Foto-Picker (ab Android 13) oder eine Galerie-App.
     * Der Callback erhaelt eine URI zum ausgewaehlten Bild (oder null wenn abgebrochen).
     * Bei Auswahl wird das Bild direkt hochgeladen (uploadPhoto).
     */
    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let { uploadPhoto(it) }
    }

    /**
     * cameraLauncher — ActivityResultContract fuer die Kamera.
     *
     * TakePicture: Startet die System-Kamera-App zum Aufnehmen eines Fotos.
     * Anders als bei der Galerie muss VORHER eine Ziel-URI angegeben werden (cameraUri),
     * in die das Foto gespeichert wird. Der Callback erhaelt nur einen Boolean (Erfolg/Abbruch).
     * Bei Erfolg wird das Foto an der gespeicherten cameraUri hochgeladen.
     */
    private val cameraLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            cameraUri?.let { uploadPhoto(it) }
        }
    }

    /**
     * onCreateView — Inflated das Layout und erzeugt das Binding-Objekt.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMemberDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * onViewCreated — Richtet die UI ein und startet den Ladevorgang.
     *
     * - Liest die memberId aus den Fragment-Arguments (uebergeben vom MembersListFragment).
     * - Setzt Click-Listener fuer: Zurueck-Navigation (Toolbar), Bearbeiten, Loeschen, Foto aendern.
     * - Laedt die Mitglieder-Daten von der API.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        memberId = arguments?.getString("memberId")

        // Toolbar: Zurueck-Pfeil navigiert zur vorherigen Ansicht
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        // Bearbeiten-Button: Navigiert zum Formular mit der memberId
        binding.btnEdit.setOnClickListener {
            val bundle = Bundle().apply { putString("memberId", memberId) }
            findNavController().navigate(R.id.action_detail_to_form, bundle)
        }
        // Loeschen-Button: Zeigt einen Bestaetigungsdialog
        binding.btnDelete.setOnClickListener { confirmDelete() }
        // Foto-Bereich: Zeigt Optionen zum Aendern/Aufnehmen/Loeschen des Fotos
        binding.photoContainer.setOnClickListener { showPhotoOptions() }

        loadMember()
    }

    /**
     * showPhotoOptions — Zeigt einen Dialog mit Foto-Optionen.
     *
     * Optionen:
     * 1. "Aus Galerie waehlen" — immer verfuegbar
     * 2. "Foto aufnehmen" — immer verfuegbar
     * 3. "Foto loeschen" — nur verfuegbar wenn bereits ein Foto vorhanden ist
     *
     * Verwendet MaterialAlertDialogBuilder fuer einen Material-Design-konformen Dialog.
     */
    private fun showPhotoOptions() {
        val options = mutableListOf(
            getString(R.string.photo_choose_gallery),
            getString(R.string.photo_take)
        )
        // "Foto loeschen" nur anzeigen wenn ein Foto vorhanden ist
        if (!member?.foto.isNullOrEmpty()) {
            options.add(getString(R.string.photo_delete))
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.photo_change)
            .setItems(options.toTypedArray()) { _, which ->
                when (which) {
                    0 -> galleryLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                    1 -> launchCamera()
                    2 -> confirmDeletePhoto()
                }
            }
            .show()
    }

    /**
     * launchCamera — Startet die Kamera-App zum Aufnehmen eines Fotos.
     *
     * FileProvider: Ermoeglicht sicheren Dateizugriff zwischen Apps.
     * Ab Android 7 (API 24) duerfen keine file:// URIs mehr an andere Apps uebergeben werden
     * (StrictMode / FileUriExposedException). Stattdessen wird ein content:// URI verwendet,
     * der ueber den FileProvider bereitgestellt wird.
     *
     * Ablauf:
     * 1. Erstellt eine temporaere Datei im Cache-Verzeichnis (mit Zeitstempel im Namen).
     * 2. Erzeugt eine content:// URI ueber FileProvider.getUriForFile().
     *    Die Authority muss mit der im AndroidManifest.xml deklarierten uebereinstimmen.
     * 3. Speichert die URI in cameraUri (fuer den Callback).
     * 4. Startet die Kamera mit der Ziel-URI.
     */
    private fun launchCamera() {
        val file = File(requireContext().cacheDir, "photo_${System.currentTimeMillis()}.jpg")
        cameraUri = FileProvider.getUriForFile(
            requireContext(),
            "${requireContext().packageName}.fileprovider",
            file
        )
        cameraLauncher.launch(cameraUri!!)
    }

    /**
     * uploadPhoto — Laedt ein Foto als Multipart-Request zur API hoch.
     *
     * Ablauf:
     * 1. Oeffnet einen InputStream zum Lesen der Bilddaten ueber den ContentResolver.
     *    Der ContentResolver ist noetig, da sowohl Galerie-URIs als auch FileProvider-URIs
     *    content:// Schemen verwenden und nicht direkt als Dateien gelesen werden koennen.
     * 2. Liest alle Bytes des Bildes ein und schliesst den InputStream.
     * 3. Erstellt einen OkHttp Multipart-Request:
     *    - RequestBody: Die Bild-Bytes mit dem erkannten Content-Type (z.B. "image/jpeg").
     *    - MultipartBody.Part: Formulardaten-Teil mit dem Feldnamen "photo" und Dateinamen "photo.jpg".
     * 4. Sendet den Upload-Request an die API.
     * 5. Bei Erfolg: Toast-Nachricht und Mitglieder-Daten neu laden (um das neue Foto anzuzeigen).
     * 6. Bei Fehler: Toast-Fehlermeldung.
     *
     * @param uri URI des hochzuladenden Bildes (aus Galerie oder Kamera)
     */
    private fun uploadPhoto(uri: Uri) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                // Bild-Daten lesen ueber den ContentResolver
                val inputStream = requireContext().contentResolver.openInputStream(uri)
                    ?: return@launch
                val bytes = inputStream.readBytes()
                inputStream.close()

                // Multipart-Request zusammenbauen
                val contentType = requireContext().contentResolver.getType(uri) ?: "image/jpeg"
                val requestBody = bytes.toRequestBody(contentType.toMediaType())
                val part = MultipartBody.Part.createFormData("photo", "photo.jpg", requestBody)

                // Upload an die API senden
                val response = ApiModule.membersApi.uploadPhoto(memberId!!, part)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), R.string.photo_upload_success, Toast.LENGTH_SHORT).show()
                    loadMember() // Daten neu laden um das neue Foto anzuzeigen
                } else {
                    Toast.makeText(requireContext(), R.string.photo_upload_error, Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), R.string.photo_upload_error, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * confirmDeletePhoto — Zeigt einen Bestaetigungsdialog zum Loeschen des Fotos.
     *
     * Fragt den Benutzer ob er das Foto wirklich loeschen moechte,
     * bevor die Loeschung durchgefuehrt wird.
     */
    private fun confirmDeletePhoto() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.photo_delete)
            .setPositiveButton(R.string.delete) { _, _ -> deletePhoto() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * deletePhoto — Loescht das Foto eines Mitglieds ueber die API.
     *
     * Bei Erfolg:
     * - Toast-Erfolgsmeldung
     * - Lokales Member-Objekt wird aktualisiert (foto = null), damit showPhotoOptions()
     *   die "Loeschen"-Option nicht mehr anbietet
     * - Foto-Anzeige wird zurueckgesetzt (Platzhalter statt Foto)
     *
     * Bei Fehler: Toast-Fehlermeldung.
     */
    private fun deletePhoto() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.deletePhoto(memberId!!)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), R.string.photo_delete_success, Toast.LENGTH_SHORT).show()
                    // Lokales Objekt aktualisieren (Kotlin copy() erstellt eine Kopie mit geaenderten Feldern)
                    member = member?.copy(foto = null)
                    // UI zuruecksetzen: Foto entfernen und Platzhalter anzeigen
                    binding.memberPhoto.setImageDrawable(null)
                    binding.memberPhoto.setBackgroundResource(R.drawable.circle_background)
                } else {
                    Toast.makeText(requireContext(), R.string.photo_delete_error, Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), R.string.photo_delete_error, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * loadMember — Laedt die Detail-Daten eines Mitglieds von der API.
     *
     * Verwendet die memberId (aus den Fragment-Arguments) fuer den API-Aufruf.
     * Bei Erfolg wird das Member-Objekt gespeichert und an displayMember() uebergeben.
     * Fehler werden stillschweigend ignoriert (leerer catch-Block).
     */
    private fun loadMember() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMember(memberId!!)
                if (response.isSuccessful) {
                    member = response.body()
                    member?.let { displayMember(it) }
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * displayMember — Zeigt alle Mitglieder-Daten in der UI an.
     *
     * Befuellt folgende Bereiche:
     * 1. Toolbar-Titel und Name
     * 2. Funktion (z.B. "Praesident")
     * 3. Foto: Laedt das Bild per Coil mit kreisrundem Zuschnitt.
     *    CachePolicy.DISABLED stellt sicher, dass nach einem Upload immer das aktuelle Bild
     *    geladen wird (kein veraltetes Bild aus dem Cache).
     * 4. Kontaktdaten: E-Mail, Telefon, Mobile (mit "-" als Fallback wenn nicht vorhanden)
     * 5. Adresse: Zusammengesetzt aus Strasse, Adresszusatz, PLZ und Ort.
     *    listOfNotNull filtert null-Werte heraus, filter entfernt leere Strings,
     *    joinToString verbindet die Teile mit Komma.
     * 6. Details: Status, Geburtstag und Eintrittsdatum (formatiert mit DateUtils)
     *
     * @param m Das anzuzeigende Mitglied
     */
    private fun displayMember(m: Member) {
        binding.toolbar.title = m.fullName
        binding.memberName.text = m.fullName
        binding.memberFunction.text = m.funktion ?: ""

        // Foto laden oder Platzhalter anzeigen
        if (!m.foto.isNullOrEmpty()) {
            binding.memberPhoto.load("https://api.fwv-raura.ch${m.foto}") {
                transformations(CircleCropTransformation())
                // Cache deaktiviert, damit nach Upload immer das aktuelle Foto geladen wird
                memoryCachePolicy(CachePolicy.DISABLED)
            }
        } else {
            binding.memberPhoto.setImageDrawable(null)
            binding.memberPhoto.setBackgroundResource(R.drawable.circle_background)
        }

        // Kontaktdaten anzeigen (mit "-" als Fallback)
        binding.detailEmail.text = "E-Mail: ${m.email ?: "-"}"
        binding.detailPhone.text = "Telefon: ${m.telefon ?: "-"}"
        binding.detailMobile.text = "Mobile: ${m.mobile ?: "-"}"

        // Adresse zusammenbauen: Strasse, Adresszusatz, PLZ + Ort
        val address = listOfNotNull(m.strasse, m.adresszusatz, "${m.plz ?: ""} ${m.ort ?: ""}".trim())
            .filter { it.isNotBlank() }
            .joinToString(", ")
        binding.detailAddress.text = "Adresse: ${address.ifBlank { "-" }}"

        // Status, Geburtstag und Eintrittsdatum anzeigen
        binding.detailStatus.text = "Status: ${m.status ?: "-"}"
        binding.detailBirthday.text = "Geburtstag: ${DateUtils.formatDate(m.geburtstag)}"
        binding.detailEntry.text = "Eintrittsdatum: ${DateUtils.formatDate(m.eintrittsdatum)}"
    }

    /**
     * confirmDelete — Zeigt einen Bestaetigungsdialog zum Loeschen des Mitglieds.
     *
     * Verwendet MaterialAlertDialogBuilder fuer einen Material-Design-Dialog.
     * Der Benutzer kann mit "Loeschen" bestaetigen oder mit "Abbrechen" den Dialog schliessen.
     */
    private fun confirmDelete() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.member_delete)
            .setMessage(R.string.member_delete_confirm)
            .setPositiveButton(R.string.delete) { _, _ -> deleteMember() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * deleteMember — Loescht das Mitglied ueber die API.
     *
     * Bei Erfolg: Navigiert zurueck zur Mitglieder-Liste (navigateUp).
     * Fehler werden stillschweigend ignoriert.
     */
    private fun deleteMember() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.deleteMember(memberId!!)
                if (response.isSuccessful) {
                    findNavController().navigateUp()
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * onDestroyView — Raeumt die Binding-Referenz auf.
     *
     * _binding wird auf null gesetzt, damit die View-Hierarchie vom Garbage Collector
     * freigegeben werden kann. Siehe MembersListFragment fuer eine ausfuehrliche Erklaerung.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
