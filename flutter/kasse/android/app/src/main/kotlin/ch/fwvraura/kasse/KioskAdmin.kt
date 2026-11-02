package ch.fwvraura.kasse

import android.app.admin.DeviceAdminReceiver

/**
 * Geraetesperre statt Fully Kiosk (wie die Kuechen-App). Wirkt erst, wenn die
 * App per adb als Geraetebesitzer eingetragen ist:
 *   adb shell dpm set-device-owner ch.fwvraura.kasse/.KioskAdmin
 * Dann sperrt MainActivity das Tablet auf die Kasse (Lock Task) und
 * installiert Updates ohne Rueckfrage.
 */
class KioskAdmin : DeviceAdminReceiver()
