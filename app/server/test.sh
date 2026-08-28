#!/usr/bin/env bash
# End-to-end exercise of every route against a local D1.
set -u
B=http://localhost:8799
A="dev-admin-token-for-local-testing-only"
pass=0; fail=0
ck() { if [ "$2" = "$3" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1 : expected [$3] got [$2]"; fail=$((fail+1)); fi }

ck "health" "$(curl -s $B/health | jq -r .ok)" "true"
ck "dashboard served" "$(curl -s -o /dev/null -w '%{http_code}' $B/)" "200"
ck "admin routes need a token" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/households)" "401"
ck "wrong admin token rejected" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer nope' $B/admin/households)" "401"

HH=$(curl -s -X POST $B/admin/households -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"name":"Baba"}')
HID=$(echo "$HH" | jq -r .household.id)
DEV=$(echo "$HH" | jq -r .device_token)
ck "household created" "$(echo "$HH" | jq -r .ok)" "true"
ck "device token is 48 hex chars" "$(echo -n "$DEV" | wc -c)" "48"

ck "ping with device token" "$(curl -s -X POST $B/rows -d "{\"token\":\"$DEV\",\"ping\":true}" | jq -r .ok)" "true"
ck "ping with a bad token" "$(curl -s -X POST $B/rows -d '{"token":"garbage-token-that-is-long","ping":true}' | jq -r .error)" "token"

post() { curl -s -X POST $B/rows -H 'Content-Type: text/plain' -d "$1"; }

# masters
post "{\"token\":\"$DEV\",\"rows\":[
 {\"id\":\"o1\",\"tab\":\"Projects\",\"mode\":\"upsert\",\"values\":[\"p1\",\"রামপুর বাড়ি\",\"অমিত\",\"ঘর\",1000,2800000,\"2026-06-01\",120,\"active\",\"t\"]},
 {\"id\":\"o2\",\"tab\":\"Workers\",\"mode\":\"upsert\",\"values\":[\"w1\",\"রতন\",600,\"\",true,\"t\"]},
 {\"id\":\"o3\",\"tab\":\"Items\",\"mode\":\"upsert\",\"values\":[\"i1\",\"সিমেন্ট\",\"বস্তা\",410,true,\"t\"]},
 {\"id\":\"o4\",\"tab\":\"Stages\",\"mode\":\"upsert\",\"values\":[\"s1\",\"ঘর\",1,\"ভিত\",40,\"t\"]},
 {\"id\":\"o5\",\"tab\":\"Stages\",\"mode\":\"upsert\",\"values\":[\"s2\",\"ঘর\",2,\"ছাদ\",60,\"t\"]},
 {\"id\":\"o6\",\"tab\":\"Coefficients\",\"mode\":\"upsert\",\"values\":[\"c1\",\"ঘর\",\"i1\",0.4,\"t\"]}
]}" > /dev/null

TODAY=$(date +%F)
R=$(post "{\"token\":\"$DEV\",\"rows\":[
 {\"id\":\"a1\",\"tab\":\"Attendance\",\"mode\":\"append\",\"values\":[\"a1\",\"b1\",\"$TODAY\",\"p1\",\"w1\",\"full\",1,600,600,0,\"\",\"t\"]},
 {\"id\":\"st1\",\"tab\":\"Stock\",\"mode\":\"append\",\"values\":[\"st1\",\"b1\",\"$TODAY\",\"p1\",\"i1\",\"in\",10,410,4100,\"party1\",\"2026-01-01\",false,\"\",\"\",\"t\"]},
 {\"id\":\"m1\",\"tab\":\"Money\",\"mode\":\"append\",\"values\":[\"m1\",\"b1\",\"$TODAY\",\"p1\",\"গাড়ি ভাড়া\",\"paid\",800,\"\",\"নগদ\",\"\",false,\"\",\"\",\"t\"]},
 {\"id\":\"pr1\",\"tab\":\"Progress\",\"mode\":\"append\",\"values\":[\"pr1\",\"b1\",\"$TODAY\",\"p1\",1,\"done\",0,\"\",\"t\"]},
 {\"id\":\"d1\",\"tab\":\"Day\",\"mode\":\"append\",\"values\":[\"d1\",\"b1\",\"$TODAY\",\"p1\",43800,45250,\"\",\"\",\"t\"]}
]}")
ck "five rows accepted" "$(echo "$R" | jq '.accepted | length')" "5"

# the retry that must not duplicate
post "{\"token\":\"$DEV\",\"rows\":[{\"id\":\"a1\",\"tab\":\"Attendance\",\"mode\":\"append\",\"values\":[\"a1\",\"b1\",\"$TODAY\",\"p1\",\"w1\",\"full\",1,600,600,0,\"\",\"t\"]}]}" > /dev/null
CNT=$(npx wrangler d1 execute site-khata --local --config wrangler.jsonc --json \
      --command "SELECT COUNT(*) c FROM attendance" 2>/dev/null | jq -r '.[0].results[0].c')
ck "a retried row is not duplicated" "$CNT" "1"

S=$(curl -s -H "Authorization: Bearer $DEV" $B/summary)
ck "summary readable with device token" "$(echo "$S" | jq -r .ok)" "true"
ck "labour totalled" "$(echo "$S" | jq -r '.projects[0].labour')" "600"
ck "material totalled" "$(echo "$S" | jq -r '.projects[0].material')" "4100"
ck "other totalled" "$(echo "$S" | jq -r '.projects[0].other')" "800"
ck "cost totalled" "$(echo "$S" | jq -r '.projects[0].cost')" "5500"
ck "stage weights give 40%" "$(echo "$S" | jq -r '.projects[0].pct_done')" "40"
ck "cash variance computed" "$(echo "$S" | jq -r '.business.cash_variance')" "-1450"
ck "unpaid purchase is a due" "$(echo "$S" | jq -r '.business.dues_total')" "4100"
ck "overdue detected" "$(echo "$S" | jq -r '.business.dues_overdue')" "4100"
ck "wages this month" "$(echo "$S" | jq -r '.business.wages_this_month')" "600"
ck "spend this month" "$(echo "$S" | jq -r '.business.spend_this_month')" "5500"
ck "entries in last 3 days" "$(echo "$S" | jq -r '.business.entries_last_3_days')" "1"
ck "burn: 10 of 400 bags" "$(echo "$S" | jq -r '.projects[0].burn[0].pct')" "2.5"

# a correction is a mirrored row, and the totals must net to nothing
post "{\"token\":\"$DEV\",\"rows\":[{\"id\":\"a1r\",\"tab\":\"Attendance\",\"mode\":\"append\",\"values\":[\"a1r\",\"b1\",\"$TODAY\",\"p1\",\"w1\",\"full\",-1,600,-600,0,\"a1\",\"t\"]}]}" > /dev/null
ck "a reversal nets the wage to zero" "$(curl -s -H "Authorization: Bearer $DEV" $B/summary | jq -r '.projects[0].labour')" "0"

# a reversed progress row must stop counting
post "{\"token\":\"$DEV\",\"rows\":[{\"id\":\"pr1r\",\"tab\":\"Progress\",\"mode\":\"append\",\"values\":[\"pr1r\",\"b1\",\"$TODAY\",\"p1\",1,\"done\",0,\"pr1\",\"t\"]}]}" > /dev/null
ck "a reversed stage stops counting" "$(curl -s -H "Authorization: Bearer $DEV" $B/summary | jq -r '.projects[0].pct_done')" "0"

# masters restate rather than pile up
post "{\"token\":\"$DEV\",\"rows\":[{\"id\":\"o2\",\"tab\":\"Workers\",\"mode\":\"upsert\",\"values\":[\"w1\",\"রতন মণ্ডল\",650,\"\",true,\"t2\"]}]}" > /dev/null
WC=$(npx wrangler d1 execute site-khata --local --config wrangler.jsonc --json \
     --command "SELECT COUNT(*) c, MAX(rate) r FROM workers" 2>/dev/null | jq -r '.[0].results[0] | "\(.c)/\(.r)"')
ck "a master row updates in place" "$WC" "1/650"

ck "pull returns the ledger" "$(curl -s -H "Authorization: Bearer $DEV" $B/pull | jq -r '.tables.Attendance | length')" "2"

# the brief
ck "no brief yet" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $DEV" $B/brief.json)" "404"
ck "device token cannot publish a brief" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/brief?household=$HID" -H "Authorization: Bearer $DEV" -d '{"generated_at":"2026-08-28T23:00:00+05:30"}')" "401"
ck "a brief without a timestamp is refused" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/brief?household=$HID" -H "Authorization: Bearer $A" -d '{"headline_bn":"x"}')" "400"
curl -s -X PUT "$B/brief?household=$HID" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"generated_at":"2026-08-28T23:00:00+05:30","headline_bn":"সব ঠিক চলছে।","cards":[]}' > /dev/null
ck "the phone can read the brief" "$(curl -s -H "Authorization: Bearer $DEV" $B/brief.json | jq -r .headline_bn)" "সব ঠিক চলছে।"

ck "export needs the admin token" "$(curl -s -o /dev/null -w '%{http_code}' "$B/export.csv?household=$HID")" "401"
ck "export carries every tab" "$(curl -s -H "Authorization: Bearer $A" "$B/export.csv?household=$HID" | grep -c '^# ')" "11"

# isolation between households
HH2=$(curl -s -X POST $B/admin/households -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"name":"Other"}')
DEV2=$(echo "$HH2" | jq -r .device_token)
ck "another household sees nothing of his" "$(curl -s -H "Authorization: Bearer $DEV2" $B/summary | jq -r '.projects | length')" "0"
ck "an unknown route 404s" "$(curl -s -o /dev/null -w '%{http_code}' $B/wat)" "404"

echo; echo "passed $pass, failed $fail"
[ "$fail" = "0" ]
