# Fenster des DMG fuer dmgbuild (dmg-bauen.sh): links die App, rechts
# «Programme», dazwischen der Pfeil im Hintergrundbild (hintergrund.svg,
# als hintergrund.tiff mit 1x und 2x fuer Retina).
import os

app = defines["app"]
name = os.path.basename(app)
hier = os.path.dirname(os.path.abspath(defines["einstellungen"]))

files = [app]
symlinks = {"Programme": "/Applications"}
format = "UDZO"
background = os.path.join(hier, "hintergrund.tiff")
window_rect = ((200, 160), (600, 400))
icon_size = 128
text_size = 13
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = "icon-view"
icon_locations = {name: (150, 190), "Programme": (450, 190)}
