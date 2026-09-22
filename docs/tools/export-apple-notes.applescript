-- SDX Inspect — export a Notes folder (text + pictures) for "Import notes"
-- 1. Open Script Editor on the Mac (Spotlight → "Script Editor").
-- 2. Paste this whole script, change the folder name below if needed, press ▶ Run.
--    The first run asks for permission to control Notes — allow it.
-- 3. A folder "SDX Notes Export" appears on the Desktop: one sub-folder per note
--    with note.txt and its photos, plus all-notes.txt (one line per note).
-- 4. In SDX Inspect: Past Reports → 📥 Import notes → drop the "SDX Notes Export"
--    folder on the page. Every stand and its pictures are filled in.

set notesFolderName to "Safety & Sanitation"

set exportRoot to (path to desktop folder as text) & "SDX Notes Export:"

on makeDir(hfsPath)
	do shell script "mkdir -p " & quoted form of POSIX path of hfsPath
end makeDir

on writeText(hfsPath, t)
	set f to open for access file hfsPath with write permission
	set eof f to 0
	write t to f as «class utf8»
	close access f
end writeText

my makeDir(exportRoot)

on twoDigits(n)
	if n < 10 then return "0" & (n as text)
	return n as text
end twoDigits

on stampFor(d)
	-- "9/22/26 5:40 PM" — the importer reads the date and the time of the walk
	set h to hours of d
	set m to minutes of d
	set suffix to "AM"
	if h ≥ 12 then set suffix to "PM"
	set h12 to h mod 12
	if h12 = 0 then set h12 to 12
	set yy to (year of d) as text
	set mo to (month of d) as integer
	return (mo as text) & "/" & ((day of d) as text) & "/" & (text 3 thru 4 of yy) & " " & (h12 as text) & ":" & my twoDigits(m) & " " & suffix
end stampFor

on safeName(t)
	set r to ""
	repeat with c in (characters of t)
		set ch to c as text
		if ch is in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 #-_." then
			set r to r & ch
		else
			set r to r & "_"
		end if
	end repeat
	if (length of r) > 60 then set r to text 1 thru 60 of r
	return r
end safeName

set allLines to ""
set noteCount to 0
set photoCount to 0

tell application "Notes"
	set theFolder to missing value
	repeat with acc in accounts
		try
			set theFolder to folder notesFolderName of acc
			exit repeat
		end try
	end repeat
	if theFolder is missing value then error "No Notes folder called \"" & notesFolderName & "\" — change notesFolderName at the top of the script."
	set theNotes to notes of theFolder
	repeat with n in theNotes
		set noteCount to noteCount + 1
		set t to name of n
		set txt to plaintext of n
		set d to creation date of n
		set stamp to my stampFor(d)
		set dirName to (my twoDigits(noteCount)) & " - " & (my safeName(t))
		set noteDir to exportRoot & dirName & ":"
		my makeDir(noteDir)
		-- the text, first line = what you typed as the note title
		my writeText(noteDir & "note.txt", stamp & " " & txt)
		-- the pictures
		set k to 0
		repeat with a in attachments of n
			set k to k + 1
			try
				set an to name of a
				if an is missing value or an is "" then set an to "photo.jpg"
				save a in file (noteDir & "photo-" & (my twoDigits(k)) & "-" & (my safeName(an)))
				set photoCount to photoCount + 1
			end try
		end repeat
		set allLines to allLines & stamp & " " & (paragraph 1 of txt) & linefeed
	end repeat
end tell

my writeText(exportRoot & "all-notes.txt", allLines)

display dialog "Exported " & noteCount & " notes and " & photoCount & " pictures to Desktop → SDX Notes Export. Now drop that folder on the Import notes page." buttons {"OK"} default button 1
