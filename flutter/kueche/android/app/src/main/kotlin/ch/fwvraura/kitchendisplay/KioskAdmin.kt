package ch.fwvraura.kitchendisplay

import android.app.admin.DeviceAdminReceiver

/**
 * Geraeteverwaltung fuer die Sperre wie bei Fully Kiosk. Wirkt erst, wenn die
 * App per adb als Geraetebesitzer eingetragen ist (README, «Gerätesperre»):
 *   adb shell dpm set-device-owner ch.fwvraura.kitchendisplay/.KioskAdmin
 * Dann sperrt MainActivity das Tablet auf die Anzeige (Lock Task) und
 * installiert Updates ohne Rueckfrage.
 */
class KioskAdmin : DeviceAdminReceiver()
