// The home venue's own tables. Loaded ONLY on the home venue (App.jsx loadHomeSeedData / bootHomeSeed), so customer
// venues and the public demo never download them. Keep this file free of code — data only.
export default {
  label: "Hard Rock Stadium",
  // Official license sheet: unit + type (C Concession, S Subcontractor, P Portable, K Kitchen) + license + status.
  registry: [
  // Source: INDEX_LICENSES_HR_STADIUM_2026.xlsx — sheet "NEW 2026" (89 active, 16 requested/needed, 1 file-ref) — reconciled row by row against the pasted 2026 sheet in v464
  { unit: "101", type: "C", license: "NOS2319780", name: "Magic City Dogs", status: "ACTIVE" },
  { unit: "101", type: "P", license: "NOS2334411", name: "Arepa Cart / Sub", status: "ACTIVE" },
  { unit: "102", type: "S", license: "NOS2325799", name: "Crisppis Chicken", status: "ACTIVE" },
  { unit: "104", type: "C", license: "NOS2319779", name: "Sobe Q", status: "ACTIVE" },
  { unit: "104", type: "P", license: "NOS2334424", name: "Arepa Cart / Sub", status: "ACTIVE" },
  { unit: "106", type: "C", license: "NOS2325797", name: "Fatboy Smashburger", status: "ACTIVE" },
  { unit: "107", type: "C", license: "NOS2319803", name: "Fan Favorites", status: "ACTIVE" },
  { unit: "107", type: "P", license: "NOS2334421", name: "Dip N Dots/ Sub", status: "ACTIVE" },
  { unit: "111", type: "S", license: "NOS2326513", name: "Amazonica", status: "ACTIVE" },
  { unit: "114", type: "P", license: "NOS2334412", name: "Shawarma / Sub", status: "ACTIVE" },
  { unit: "114", type: "C", license: "NOS2319802", name: "Magic City Dogs", status: "ACTIVE" },
  { unit: "114", type: "P", license: "NOS2334416", name: "La Placita", status: "ACTIVE" },
  { unit: "114A", type: "S", license: "NOS2334824", name: "Cheeseburger Baby", status: "ACTIVE" },
  { unit: "117", type: "S", license: "NOS2319801", name: "Seed", status: "ACTIVE" },
  { unit: "117A", type: "C", license: "NOS2334823", name: "AIFI Wynwood Walkthrough", status: "ACTIVE" },
  { unit: "119", type: "C", license: "NOS2319796", name: "Tostitos", status: "ACTIVE" },
  { unit: "120A", type: "C", license: "NOS2334822", name: "Sol Cubano", status: "ACTIVE" },
  { unit: "122", type: "C", license: "NOS2319795", name: "Cantaloupe", status: "ACTIVE" },
  { unit: "122", type: "P", license: "NOS2334408", name: "Joe Smashed Burger Cart", status: "ACTIVE" },
  { unit: "119", type: "P", license: "NOS2334419", name: "Arepa Cart / Sub", status: "ACTIVE", note: "Moved from 122" },
  { unit: "122", type: "P", license: "", name: "Tostitos Nacho Cart", status: "NEEDED" },
  { unit: "122A", type: "C", license: "NOS2334821", name: "AIFI Wynwood Walkthrough", status: "ACTIVE" },
  { unit: "129", type: "C", license: "NOS2319794", name: "Magic City Dogs", status: "ACTIVE" },
  { unit: "129", type: "P", license: "NOS2334417", name: "Kosher Burger & Dogs / Sub", status: "ACTIVE" },
  { unit: "129", type: "P", license: "", name: "Shawarma", status: "REQUESTED" },
  { unit: "132", type: "C", license: "NOS2319793", name: "Sobe Q", status: "ACTIVE" },
  { unit: "130A", type: "C", license: "NOS2321406", name: "Avoeats", status: "ACTIVE" },
  { unit: "134", type: "S", license: "NOS2325137", name: "Novecento", status: "ACTIVE" },
  { unit: "135", type: "C", license: "NOS2319789", name: "Magic City Dogs", status: "ACTIVE" },
  { unit: "135", type: "P", license: "", name: "Shawarma", status: "REQUESTED" },
  { unit: "137", type: "P", license: "NOS2338680", name: "Dip N Dots/ Sub", status: "ACTIVE" },
  { unit: "139", type: "S", license: "NOS2319787", name: "Italian Vice", status: "ACTIVE" },
  { unit: "142", type: "C", license: "NOS2319788", name: "Little Caesar", status: "ACTIVE" },
  { unit: "142", type: "P", license: "NOS2334406", name: "Mr Chory", status: "ACTIVE" },
  { unit: "142A", type: "C", license: "NOS2334820", name: "AIFI Smashed Burger", status: "ACTIVE" },
  { unit: "144A", type: "S", license: "NOS2334819", name: "Fuku", status: "ACTIVE" },
  { unit: "148", type: "P", license: "NOS2334422", name: "Dip N Dots/ Sub", status: "ACTIVE" },
  { unit: "148", type: "P", license: "NOS2334423", name: "Kosher Burger & Hot Dogs / Sub", status: "ACTIVE" },
  { unit: "148", type: "P", license: "", name: "Cortadito", status: "REQUESTED" },
  { unit: "148", type: "S", license: "NOS2334818", name: "Benihana", status: "ACTIVE" },
  { unit: "150", type: "P", license: "NOS2334420", name: "Chef Creole", status: "ACTIVE" },
  { unit: "150", type: "P", license: "", name: "Tostitos Nacho Cart", status: "NEEDED" },
  { unit: "150", type: "C", license: "NOS2319781", name: "Cantaloupe", status: "ACTIVE" },
  { unit: "150A", type: "C", license: "NOS2334817", name: "AIFI Edgewater Grill", status: "ACTIVE" },
  { unit: "154", type: "C", license: "NOS2326512", name: "Sweet Cream", status: "ACTIVE" },
  { unit: "203", type: "C", license: "NOS2319797", name: "Section 203 & Bar", status: "ACTIVE" },
  { unit: "214", type: "C", license: "NOS2324070", name: "Farmstead / Shawarma", status: "ACTIVE" },
  { unit: "217", type: "C", license: "NOS2331747", name: "Donuts & Ice Cream", status: "ACTIVE" },
  { unit: "219", type: "C", license: "NOS2331746", name: "Stacked Shorty's / Sobe Q", status: "ACTIVE" },
  { unit: "220", type: "P", license: "NOS2338676", name: "Bubba Ice", status: "ACTIVE" },
  { unit: "222", type: "C", license: "NOS2325643", name: "Shula Burger / Farmstead / Pizza", status: "ACTIVE" },
  { unit: "231", type: "S", license: "NOS2332692", name: "Tacotomia", status: "ACTIVE" },
  { unit: "233", type: "S", license: "NOS2332693", name: "Cheeseburger Baby", status: "ACTIVE" },
  { unit: "242", type: "C", license: "NOS2319786", name: "Edgewater Grill", status: "ACTIVE" },
  { unit: "243", type: "S", license: "NOS2331745", name: "Sushi Maki / Asia Bites", status: "ACTIVE" },
  { unit: "245", type: "S", license: "NOS2331744", name: "Puffles", status: "ACTIVE" },
  { unit: "246", type: "S", license: "NOS2331743", name: "Ella Cafe", status: "ACTIVE" },
  { unit: "247", type: "C", license: "File# 377155", name: "Sobe Q", status: "FILE_REF" },
  { unit: "250", type: "C", license: "NOS2324069", name: "Shula Burger / Farmstead / Pizza", status: "ACTIVE" },
  { unit: "304", type: "S", license: "NOS2319783", name: "Granny Beez", status: "ACTIVE" },
  { unit: "307", type: "P", license: "NOS2338681", name: "Kosher Hot Dog / Arepa Cart", status: "ACTIVE" },
  { unit: "308", type: "C", license: "NOS2319806", name: "Cantaloupe", status: "ACTIVE" },
  { unit: "310", type: "P", license: "NOS2338679", name: "Sizzle & Dippin Dots / Sub", status: "ACTIVE" },
  { unit: "311", type: "P", license: "", name: "Fuku", status: "NEEDED", note: "Check if can be combined with current DippNDots / Sizzle carts in 310" },
  { unit: "311", type: "P", license: "", name: "Walking Tacos", status: "NEEDED" },
  { unit: "312", type: "S", license: "NOS2319805", name: "La MilaNation", status: "ACTIVE" },
  { unit: "314", type: "P", license: "", name: "Cheese Burger Baby", status: "NEEDED" },
  { unit: "315", type: "P", license: "NOS2334415", name: "Arepa Cart / Sub", status: "ACTIVE" },
  { unit: "317", type: "C", license: "NOS2319804", name: "Mr. Chory", status: "ACTIVE" },
  { unit: "317A", type: "C", license: "NOS2334859", name: "AIFI Smashed Burger", status: "ACTIVE" },
  { unit: "318", type: "C", license: "NOS2326971", name: "Sweet Cream", status: "ACTIVE" },
  { unit: "319", type: "S", license: "NOS2319800", name: "Fuku", status: "ACTIVE" },
  { unit: "319A", type: "C", license: "NOS2334858", name: "AIFI Edgewater Grill", status: "ACTIVE" },
  { unit: "322", type: "P", license: "NOS2334405", name: "Shawarma / Sub", status: "ACTIVE" },
  { unit: "323", type: "P", license: "NOS2338677", name: "Dip N Dots/ Sub", status: "ACTIVE" },
  { unit: "325", type: "P", license: "", name: "Tostitos Nacho Cart", status: "NEEDED" },
  { unit: "325", type: "P", license: "NOS2334414", name: "Arepa Cart / Sub", status: "ACTIVE" },
  { unit: "325", type: "P", license: "", name: "Hot Dog", status: "NEEDED", note: "Check if can be combined with current Arepa cart in 325" },
  { unit: "327", type: "C", license: "NOS2319798", name: "Fan Favorites", status: "ACTIVE" },
  { unit: "329", type: "S", license: "NOS2321412", name: "Crisppis Chicken", status: "ACTIVE" },
  { unit: "332", type: "S", license: "NOS2324673", name: "Seed", status: "ACTIVE" },
  { unit: "336", type: "C", license: "NOS2319792", name: "Cantaloupe", status: "ACTIVE" },
  { unit: "338", type: "P", license: "NOS2334407", name: "Sizzle & Dippin Dots / Sub", status: "ACTIVE" },
  { unit: "338", type: "P", license: "", name: "Fuku", status: "NEEDED", note: "Check if can be combined with current DippNDots / Sizzle carts in 338" },
  { unit: "338", type: "P", license: "", name: "Walking Tacos", status: "NEEDED" },
  { unit: "338", type: "P", license: "", name: "Arepas Lemonade", status: "NEEDED" },
  { unit: "340", type: "S", license: "NOS2319791", name: "Tacotomia", status: "ACTIVE" },
  { unit: "342", type: "P", license: "NOS2334409", name: "Mr Chory", status: "ACTIVE" },
  { unit: "345", type: "C", license: "NOS2319790", name: "Little Caesar", status: "ACTIVE" },
  { unit: "345A", type: "C", license: "NOS2334857", name: "AIFI Smashed Burger", status: "ACTIVE" },
  { unit: "347", type: "S", license: "NOS2326622", name: "Lucky Chicken", status: "ACTIVE" },
  { unit: "347A", type: "C", license: "NOS2334856", name: "AIFI Edgewater Grill", status: "ACTIVE" },
  { unit: "350", type: "S", license: "NOS2326620", name: "Sol Cubano", status: "ACTIVE" },
  { unit: "351", type: "P", license: "", name: "Tostitos Nacho Cart", status: "NEEDED" },
  { unit: "350", type: "P", license: "NOS2338678", name: "Dip N Dots/ Sub", status: "ACTIVE" },
  { unit: "350", type: "P", license: "", name: "SHAWARMA", status: "REQUESTED" },
  { unit: "354", type: "P", license: "NOS2334404", name: "Arepa Cart (Sub)", status: "ACTIVE" },
  { unit: "354", type: "P", license: "", name: "Hot Dog", status: "NEEDED", note: "Check if can be combined with current Arepa cart in 354" },
  { unit: "355", type: "C", license: "NOS2326624", name: "Fan Favorite", status: "ACTIVE" },
  { unit: "External", type: "C", license: "NOS2336936", name: "Training Facility Batist.", status: "ACTIVE" },
  { unit: "G", type: "K", license: "NOS2324068", name: "Main Kitchen", status: "ACTIVE" },
  { unit: "G", type: "K", license: "NOS2334853", name: "Lexus North Club & Main Warehouse", status: "ACTIVE" },
  { unit: "G", type: "K", license: "NOS2334854", name: "72 Club South/East", status: "ACTIVE" },
  { unit: "147", type: "K", license: "SEA2338350", name: "Nine", status: "ACTIVE" },
  { unit: "204", type: "K", license: "NOS2321413", name: "M Club Liv Kitchen", status: "ACTIVE" },
  { unit: "232", type: "K", license: "NOS2324071", name: "Suite Kitchen", status: "ACTIVE" },
],
  // Every way the inspectors write a stand name → its license number (name-keyed; matched after normalising).
  aliases: {
  // Stand 101
  "101 - Magic City Dogs":              "NOS2319780",
  "101 Magic City Dogs":                "NOS2319780",
  "P101 - Arepa Cart / Sub":            "NOS2334411",
  "P101 Arepa Cart":                    "NOS2334411",
  // Stand 102
  "102 - Crispis Chicken":              "NOS2325799",
  "102 Crispis Chicken":                "NOS2325799",
  "102 - Crisppis Chicken":             "NOS2325799",
  // Stand 104
  "104 - Sobe Q":                       "NOS2319779",
  "104 Sobe Q":                         "NOS2319779",
  "P104 - Arepa Cart / Sub":            "NOS2334424",
  "P104 Arepa Cart":                    "NOS2334424",
  // Stand 106
  "106 - Fatboy Smashburger":           "NOS2325797",
  "106 Fatboy Smashburger":             "NOS2325797",
  // Stand 107
  "107 - Fan Favorites":                "NOS2319803",
  "107 Fan Favorites":                  "NOS2319803",
  "P107 - Dip N Dots / Sub":            "NOS2334421",
  "P107 Dip N Dots":                    "NOS2334421",
  // Stand 111
  "111 - Ella Cafe":                    "NOS2326513",
  "111 Ella Cafe":                      "NOS2326513",
  // Stand 114
  "P114 - Shawarma Gyros / Sub":        "NOS2334412",
  "P114 - Shawarma / Sub":              "NOS2334412",
  "P114 Shawarma":                      "NOS2334412",
  "P114 Shawarma Gyros":                "NOS2334412",
  "114 - Magic City Dogs":              "NOS2319802",
  "114 Magic City Dogs":                "NOS2319802",
  "P114 - Talkin Tacos / Sub":          "NOS2334416",
  "P114 Talkin Tacos":                  "NOS2334416",
  // Stand 117
  "117 - Seed":                         "NOS2319801",
  "117 Seed":                           "NOS2319801",
  // Stand 119
  "119 - Tostitos":                     "NOS2319796",
  "119 Tostitos":                       "NOS2319796",
  // Stand 122
  "122 - Cantaloupe":                   "NOS2319795",
  "122 Cantaloupe":                     "NOS2319795",
  "P122 - Fat Boy Smashed Cart":        "NOS2334408",
  "P122 Fat Boy Smashed Cart":          "NOS2334408",
  "P119 - Arepa Cart / Sub":            "NOS2334419",
  "P119 Arepa Cart":                    "NOS2334419",
  "P122 - Arepa Cart / Sub":            "NOS2334419",
  "P122 Arepa Cart":                    "NOS2334419",
  // Stand 129
  "129 - Magic City Dogs":              "NOS2319794",
  "129 Magic City Dogs":                "NOS2319794",
  "P129 - Kosher Burger & Dogs / Sub":  "NOS2334417",
  "P129 Kosher Burger":                 "NOS2334417",
  // Stand 132
  "132 - Sobe Q":                       "NOS2319793",
  "132 Sobe Q":                         "NOS2319793",
  // Stand 134
  "134 - Novecento":                    "NOS2325137",
  "134 Novecento":                      "NOS2325137",
  // Stand 135
  "135 - Magic City Dogs":              "NOS2319789",
  "135 Magic City Dogs":                "NOS2319789",
  // Stand 137
  "P137 - Dip N Dots / Sub":            "NOS2338680",
  "P137 Dip N Dots":                    "NOS2338680",
  // Stand 114A
  "114A - Cheeseburger Baby":           "NOS2334824",
  "114A Cheeseburger Baby":             "NOS2334824",
  // Stand 117A
  "117A - AIFI Wynwood Walkthrough":    "NOS2334823",
  "117A AIFI Wynwood":                  "NOS2334823",
  // Stand 120A
  "120A - Sol Cubano":                  "NOS2334822",
  "120A Sol Cubano":                    "NOS2334822",
  // Stand 122A
  "122A - AIFI Wynwood Walkthrough":    "NOS2334821",
  "122A AIFI Wynwood":                  "NOS2334821",
  // Stand 130A
  "130A - Avoeats":                     "NOS2321406",
  "130A Avoeats":                       "NOS2321406",
  // Stand 142A
  "142A - AIFI Smashed Burger":         "NOS2334820",
  "142A AIFI Smashed Burger":           "NOS2334820",
  // Stand 144A
  "144A - Fuku":                        "NOS2334819",
  "144A Fuku":                          "NOS2334819",
  // Stand 150A
  "150A - AIFI Edgewater Grill":        "NOS2334817",
  "150A AIFI Edgewater Grill":          "NOS2334817",
  // Stand 231
  "231 - Talkin Tacos":                 "NOS2332692",
  "231 Talkin Tacos":                   "NOS2332692",
  // Stand 232
  "232 - Suite Kitchen":                "NOS2324071",
  "232 Suite Kitchen":                  "NOS2324071",
  // Stand 233
  "233 - Cheeseburger Baby":            "NOS2332693",
  "233 Cheeseburger Baby":              "NOS2332693",
  // Stand 242
  "242 - Edgewater Grill":              "NOS2319786",
  "242 Edgewater Grill":                "NOS2319786",
  // Stand 243
  "243 - Sushi Maki / Sea Food Republic": "NOS2331745",
  "243 Sushi Maki":                     "NOS2331745",
  "243 Sea Food Republic":              "NOS2331745",
  // Stand 245
  "245 - Puffles":                      "NOS2331744",
  "245 Puffles":                        "NOS2331744",
  // Stand 246
  "246 - La Carreta":                   "NOS2331743",
  "246 La Carreta":                     "NOS2331743",
  // Stand 247
  "247 - Sobe Q":                       "File# 377155",
  "247 Sobe Q":                         "File# 377155",
  // Stand 250
  "250 - Shula Burger / Farmstead / Pizza": "NOS2324069",
  "250 Shula Burger":                   "NOS2324069",
  "250 Farmstead":                      "NOS2324069",
  // Stand 304
  "304 - Granny Beez":                  "NOS2319783",
  "304 Granny Beez":                    "NOS2319783",
  // Stand 307
  "P307 - Kosher Hot Dog / Arepa Cart": "NOS2338681",
  "P307 Kosher Hot Dog":                "NOS2338681",
  // Stand 308
  "308 - Cantaloupe":                   "NOS2319806",
  "308 Cantaloupe":                     "NOS2319806",
  // Stand 310
  "P310 - Sizzle & Dippin Dots / Sub":  "NOS2338679",
  "P310 Sizzle Dippin Dots":            "NOS2338679",
  // Stand 312
  "312 - La MilaNation":                "NOS2319805",
  "312 La MilaNation":                  "NOS2319805",
  "312 La Milanation":                  "NOS2319805",
  // Stand 315
  "P315 - Arepa Cart / Sub":            "NOS2334415",
  "P315 Arepa Cart":                    "NOS2334415",
  // Stand 317
  "317 - Sol Cubano":                   "NOS2319804",
  "317 Sol Cubano":                     "NOS2319804",
  // Stand 317A
  "317A - AIFI Smashed Burger":         "NOS2334859",
  "317A AIFI Smashed Burger":           "NOS2334859",
  // Stand 318
  "318 - Sweet Cream":                  "NOS2326971",
  "318 Sweet Cream":                    "NOS2326971",
  // Stand 319A
  "319A - AIFI Edgewater Grill":        "NOS2334858",
  "319A AIFI Edgewater Grill":          "NOS2334858",
  // Stand 322
  "P322 - Shawarma Gyros / Sub":        "NOS2334405",
  "P322 - Shawarma / Sub":              "NOS2334405",
  "P322 Shawarma":                      "NOS2334405",
  "P322 Shawarma Gyros":                "NOS2334405",
  // Stand 323
  "P323 - Dip N Dots / Sub":            "NOS2338677",
  "P323 Dip N Dots":                    "NOS2338677",
  // Stand 325
  "P325 - Arepa Cart / Sub":            "NOS2334414",
  "P325 Arepa Cart":                    "NOS2334414",
  // Stand 327
  "327 - Fan Favorites":                "NOS2319798",
  "327 Fan Favorites":                  "NOS2319798",
  // Stand 329
  "329 - Crispis Chicken":              "NOS2321412",
  "329 Crispis Chicken":                "NOS2321412",
  // Stand 332
  "332 - Seed":                         "NOS2324673",
  "332 Seed":                           "NOS2324673",
  // Stand 336
  "336 - Cantaloupe":                   "NOS2319792",
  "336 Cantaloupe":                     "NOS2319792",
  // Stand 338
  "P338 - Sizzle & Dippin Dots / Sub":  "NOS2334407",
  "P338 Sizzle Dippin Dots":            "NOS2334407",
  // Stand 340
  "340 - Talkin Tacos":                 "NOS2319791",
  "340 Talkin Tacos":                   "NOS2319791",
  // Stand 342
  "P342 - Mr Chory":                    "NOS2334409",
  "P342 Mr Chory":                      "NOS2334409",
  // Stand 345
  "345 - Little Caesar":                "NOS2319790",
  "345 Little Caesar":                  "NOS2319790",
  // Stand 345A
  "345A - AIFI Smashed Burger":         "NOS2334857",
  "345A AIFI Smashed Burger":           "NOS2334857",
  // Stand 347
  "347 - Lucky Chicken":                "NOS2326622",
  "347 Lucky Chicken":                  "NOS2326622",
  // Stand 347A
  "347A - AIFI Edgewater Grill":        "NOS2334856",
  "347A AIFI Edgewater Grill":          "NOS2334856",
  // Stand 350
  "350 - Benihanas":                    "NOS2326620",
  "350 Benihanas":                      "NOS2326620",
  "P350 - Dip N Dots / Sub":            "NOS2338678",
  "P350 Dip N Dots":                    "NOS2338678",
  // Stand 354
  "P354 - Arepa Cart (Sub)":            "NOS2334404",
  "P354 Arepa Cart":                    "NOS2334404",
  // Stand 355
  "355 - Fan Favorite":                 "NOS2326624",
  "355 Fan Favorite":                   "NOS2326624",
  // Global / Kitchen
  "Main Kitchen":                       "NOS2324068",
  "Lexus North Club & Main Warehouse":  "NOS2334853",
  "Lexus North Club":                   "NOS2334853",
  "72 Club South/East":                 "NOS2334854",
  "72 Club South East":                 "NOS2334854",
  "Training Facility Batist.":          "NOS2336936",
  "Training Facility":                  "NOS2336936",
},
  // Names the reports used at 2+ units when v564 shipped, so follow-up keys match from the first minute.
  fuShared: {"tacotomia":"231 340 341","chefcreole":"150 150A 154 329","mrchory":"142 317 318 342","magiccitydogs":"101 114 129 135","aifiwynwoodwalkthrough":"117A 122A 142A","solcubano":"120 350","sobeq":"104 132 247","aifismashedburger":"142A 345A","aifiedgewatergrill":"150A 317A 319A 347A","shulaburgerfarmsteadpizza":"203 222 250","arepacartsub":"315 354","fanfavorites":"107 327 355","fatboysmashburger":"106 122 150","cheeseburgerbaby":"114 114A 233","fuku":"145 319","cantaloupe":"122 150 150A 308 327 336 355","seed":"117 332","littlecaesar":"142 345","kitchen":"204 M19B M45","bar":"201 210 228 311 342","fanfavorite":"203 355","kosherkorner":"114 129 148 320","seeds":"117 332","stacked":"219 219-","tostitos":"119 122 150","lamilanation":"312 313","aifi":"317 317A 319A 345A 347A","shawarma":"114 135 322","wynwoodwalkthrough":"117 117A 122 122A 142 142A 150 150A","italianvice":"139 340","puffles":"245 318","sweetspot":"107 154 354","pantry":"307 325 342","magiccitydog":"101 114 129 135","smashburger":"106 122","lemonadecart":"104 308 322 337","talkintacos":"231 340","arepacart":"148 307","fanfav":"107 122 135"},
  // Renamed stands: old slug → new slug (ids stored under the old name keep resolving).
  slugAliases: { shawarmagyrossub: "shawarmasub", shawarmagyros: "shawarma" },
  // Units that don't follow the 1xx/2xx/3xx floor rule.
  unitFloors: { M47: "Floor 2" },
  // Stands whose floor is known by name: [regex source, flags, floor].
  floorByName: [["lexus", "i", "Ground Level"], ["main\\s*kitchen", "i", "Ground Level"], ["nine\\s*club", "i", "Floor 1"]],
};
