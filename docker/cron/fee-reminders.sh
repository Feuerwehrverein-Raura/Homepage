#!/bin/bash
# Taegliche Zahlungserinnerungen fuer offene, faellige Mitgliederbeitraege.
# Auf dem Server als /opt/fwv-raura/cron/fee-reminders.sh, Crontab:
#   0 9 * * * /opt/fwv-raura/cron/fee-reminders.sh >> /var/log/fwv-reminders.log 2>&1
# Der Endpunkt respektiert den 30-Tage-Takt (last_reminder_at) und sendet Push + E-Mail.
docker exec fwv-api-accounting node -e '
const http=require("http");
const req=http.request({host:"localhost",port:3000,path:"/membership-fees/cron-reminders",method:"POST",headers:{"X-Cron-Key":process.env.INTERNAL_API_KEY,"Content-Type":"application/json"}},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>console.log(new Date().toISOString(),"fee-reminders",r.statusCode,d))});
req.on("error",e=>console.error("fee-reminders error:",e.message));
req.end("{}");
'
