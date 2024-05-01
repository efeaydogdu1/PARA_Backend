const pdfParse = require("pdf-parse");
const fs = require("fs");

function parseAndPrintTranscript(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);

  return pdfParse(dataBuffer)
    .then(function (data) {
      const lines = data.text.split("\n");
      let studentInfo = {};
      let academicHistory = [];
      let currentCourses = { term: "", courses: [] };
      let capturingCourses = false;
      let capturingCurrentCourses = false;

      let collectNextLineForKey = null;

      lines.forEach((line, index) => {
        line = line.trim();

        // Check if the previous line indicated a key requiring next line's continuation
        if (collectNextLineForKey) {
          studentInfo[collectNextLineForKey] = line.split(":")[1]?.trim();
          collectNextLineForKey = null; // Reset
        }

        // Capture student info
        if (/^(Name|Student Number|Birth Date|Admit Semester|Admit Type|Level|Faculty|Program\(s\))/.test(line)) {
          let [key, value] = line.split(":").map((part) => part.trim());
          if (value) {
            // Direct capture if the line contains a colon followed by information
            studentInfo[
              key.toLowerCase().replace(/\(s\)/, "s").replace(/\s/g, "_")
            ] = value;
          } else {
            // If value is missing, prepare to capture it from the next line
            collectNextLineForKey = key.toLowerCase().replace(/\(s\)/, "s").replace(/\s/g, "_");
          }
        }

        // Check for course terms and capture courses
        if (/^(Fall|Spring|Summer)\s\d{4}-\d{4}/.test(line) && !line.includes("Admit Semester")) {
          capturingCourses = true;
          currentTerm = { term: line.trim(), courses: [] };
        } else if (capturingCourses) {
          if (/^Standing:/.test(line)) {
            academicHistory.push(currentTerm);
            capturingCourses = false;
          } else if (!line.startsWith("Courses") && !line.startsWith("Faculty:") && !line.startsWith("Page")) {
            let course = parseCourseLine(line);
            if (course) currentTerm.courses.push(course);
          }
          
        }
      });

      // Capture Current Courses in Progress
      const coursesInProgressIndex = lines.findIndex(line => /COURSES IN PROGRESS/.test(line));

      if (coursesInProgressIndex !== -1) {
        for (let i = coursesInProgressIndex + 1; i < lines.length; i++) {
          let line = lines[i].trim();

          if (/^(Fall|Spring|Summer)\s\d{4}-\d{4}/.test(line)) {

            capturingCurrentCourses = true;
            currentCourses.term = line;

            continue;
          }

          if (capturingCurrentCourses) {
            if (/^Term (SU|ECTS) Credits:/.test(line)) break;

            let course = parseCurrentCourseLine(line);
            if (course) currentCourses.courses.push(course);
          }
        }
      }


      // Combine all information into the final transcript object

      const transcript = {
        student_info: studentInfo,
        academic_history: academicHistory,
        current_courses: currentCourses,
      };

      return transcript;
    })
    .catch(function (error) {
      throw new Error("Error processing PDF:", error);
    });
}

function parseCurrentCourseLine(line) {
  line = line.trim(); // Trim the line to remove any leading/trailing whitespace

  // Extract the course code which is the combination of the first two words
  const codeMatch = line.match(/^(\w+\s+\d+)/);
  if (!codeMatch) return null; // Return null if the course code pattern doesn't match
  const code = codeMatch[1].replace(/\s+/, ""); // Remove spaces between the department code and course number

  // Extract the title by taking the string up to "UG"
  const titleEndIndex = line.indexOf("UG");
  if (titleEndIndex === -1) return null; // Return null if "UG" is not found
  const title = line.substring(code.length + 1, titleEndIndex).trim();

  // Level is always "UG" for current courses in this format
  const level = "UG";

  // Extract SU Credits and ECTS Credits
  const creditsString = line.substring(titleEndIndex + 2).trim(); // +2 to skip "UG"
  const creditsMatch = creditsString.match(/(\d+\.\d{2})(\d+\.\d{2})/);
  if (!creditsMatch) return null; // Return null if the credits pattern doesn't match

  // Separate SU Credits and ECTS Credits based on the dot position
  const suCredits = creditsMatch[1];
  const ectsCredits =
    creditsMatch[2].substring(0, 2) + creditsMatch[2].substring(2); // Insert dot

  // Registration status is the last word
  const statusMatch = line.match(/\b(\w+)$/);
  const registrationStatus = statusMatch ? statusMatch[1] : "";

  return {
    code,
    title,
    level,
    su_credits: suCredits,
    ects_credits: ectsCredits,
    registration_status: registrationStatus,
  };
}

function parseCourseLine(line) {
  line = line.trim(); // Trim the line to remove any leading/trailing whitespace

  // Find the end of the course code (which ends with numbers) to locate the start of the title
  const codeEndIndex = line.search(/\d(?=[^\d]|$)/) + 1;
  const code = line.substring(0, codeEndIndex);

  // Find the "UG" from the end to locate the end of the title
  const ugIndexFromEnd = line.lastIndexOf("UG");

  // Extract the title by taking the string between the end of the course code and the "UG" index
  const title = line.substring(codeEndIndex, ugIndexFromEnd).trim();

  // Extract the grade, remove "UG" if present, and potentially followed by a plus or minus sign
  const gradeMatch = line.substring(ugIndexFromEnd + 2).match(/[A-Z]+\+?-?/); // +2 to skip "UG"
  const grade = gradeMatch ? gradeMatch[0] : "";

  // Extract SU Credits, Quality Credits, and ECTS Credits by parsing the remaining part of the line
  const creditsString = line
    .substring(ugIndexFromEnd + grade.length + 2)
    .trim(); // +2 to skip "UG"
  const creditsParts = creditsString.split(/\s+/);
  const suCredits = creditsParts[0];

  // Correctly separate the quality credits and ECTS credits
  let qualityEctsString =
    creditsParts[1] + (creditsParts[2] ? "." + creditsParts[2] : ""); // Handle missing parts gracefully
  const dotIndex = qualityEctsString.indexOf(".");
  const qualityCredits = qualityEctsString.substring(0, dotIndex + 3); // Include the dot and two digits after it
  const ectsCredits = qualityEctsString
    .substring(dotIndex + 3)
    .replace(/^\.+/, ""); // Remove any leading dots

  return {
    code,
    title,
    level: "UG",
    grade,
    su_credits: suCredits,
    quality_credits: qualityCredits,
    ects_credits: ectsCredits,
  };
}


/*parseAndPrintTranscript("C:\\Users\\Public\\PARA-backend\\Transcript.pdf")
.then(transcript => {
    console.log("Transcript Object:", JSON.stringify(transcript, null, 2));
})
.catch(error => {
    console.error(error);
});*/
module.exports = {parseAndPrintTranscript};

//PDF reader işte transcript okuyor