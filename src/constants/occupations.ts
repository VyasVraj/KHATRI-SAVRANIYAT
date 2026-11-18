/**
 * Official 30 Main Occupation Categories & Comprehensive Sub-Occupations
 * Sources:
 * 1. "30_Main_Occupation_Categories(2).pdf" (Authoritative 30 Main Categories)
 * 2. "Occupations_List_English_Hindi.pdf" (389 common occupations across fields in English and Hindi)
 *
 * STRICT GOVERNANCE RULES:
 * - 30 official main categories preserved.
 * - Specific occupations grouped cleanly under the 30 categories.
 * - Occupation is optional across all forms.
 * - Canonical storage on persons table (occupation, occupation_category).
 */

export const OCCUPATION_PENDING = 'Occupation Pending'
export const OCCUPATION_NOT_PROVIDED = 'Occupation Not Provided'

export const OCCUPATION_CATEGORIES = [
  'Agriculture',
  'Healthcare',
  'Education',
  'Engineering',
  'Information Technology',
  'Science and Research',
  'Business and Entrepreneurship',
  'Finance and Banking',
  'Law and Legal Services',
  'Government Services',
  'Defence and Military',
  'Police and Security',
  'Construction and Real Estate',
  'Manufacturing and Industry',
  'Skilled Trades and Repair',
  'Transport and Logistics',
  'Retail and Trade',
  'Hospitality and Tourism',
  'Food and Catering',
  'Media and Journalism',
  'Arts and Entertainment',
  'Design and Fashion',
  'Beauty and Personal Care',
  'Sports and Fitness',
  'Social Work and NGOs',
  'Energy and Utilities',
  'Telecommunications',
  'Domestic and Household Services',
  'Religious and Cultural Services',
  'Digital and Online Services',
] as const

export type OccupationCategory = (typeof OCCUPATION_CATEGORIES)[number]

export interface SpecificOccupationItem {
  id: number
  name: string
  hindiName: string
  category: OccupationCategory
}

/**
 * 389 Common Occupations from the authoritative PDF grouped under the 30 Categories
 */
export const SPECIFIC_OCCUPATIONS: readonly SpecificOccupationItem[] = [
  // 1. Agriculture
  { id: 1, name: 'Farmer', hindiName: 'किसान', category: 'Agriculture' },
  { id: 2, name: 'Agricultural Labourer', hindiName: 'खेतिहर मज़दूर', category: 'Agriculture' },
  { id: 3, name: 'Gardener', hindiName: 'माली', category: 'Agriculture' },
  { id: 4, name: 'Horticulturist', hindiName: 'बागवानी विशेषज्ञ', category: 'Agriculture' },
  { id: 5, name: 'Agronomist', hindiName: 'कृषि विशेषज्ञ', category: 'Agriculture' },
  { id: 6, name: 'Planter', hindiName: 'बागान मालिक', category: 'Agriculture' },
  { id: 7, name: 'Dairy Farmer', hindiName: 'डेयरी किसान', category: 'Agriculture' },
  { id: 8, name: 'Livestock Keeper', hindiName: 'पशुपालक', category: 'Agriculture' },
  { id: 9, name: 'Poultry Farmer', hindiName: 'मुर्गी पालक', category: 'Agriculture' },
  { id: 10, name: 'Shepherd', hindiName: 'गड़रिया (चरवाहा)', category: 'Agriculture' },
  { id: 11, name: 'Cowherd', hindiName: 'ग्वाला', category: 'Agriculture' },
  { id: 12, name: 'Beekeeper', hindiName: 'मधुमक्खी पालक', category: 'Agriculture' },
  { id: 13, name: 'Fisherman', hindiName: 'मछुआरा', category: 'Agriculture' },
  { id: 14, name: 'Fish Farmer', hindiName: 'मत्स्य पालक', category: 'Agriculture' },
  { id: 15, name: 'Forester', hindiName: 'वनकर्मी', category: 'Agriculture' },
  { id: 16, name: 'Forest Guard', hindiName: 'वनरक्षक', category: 'Agriculture' },
  { id: 17, name: 'Woodcutter', hindiName: 'लकड़हारा', category: 'Agriculture' },
  { id: 18, name: 'Tractor Driver', hindiName: 'ट्रैक्टर चालक', category: 'Agriculture' },

  // 2. Healthcare
  { id: 30, name: 'Doctor', hindiName: 'डॉक्टर (चिकित्सक)', category: 'Healthcare' },
  { id: 31, name: 'Dentist', hindiName: 'दंत चिकित्सक', category: 'Healthcare' },
  { id: 32, name: 'Nurse', hindiName: 'नर्स (परिचारिका)', category: 'Healthcare' },
  { id: 33, name: 'Pharmacist', hindiName: 'फ़ार्मासिस्ट', category: 'Healthcare' },
  { id: 34, name: 'Medical Store Owner', hindiName: 'दवा विक्रेता', category: 'Healthcare' },
  { id: 35, name: 'Veterinarian', hindiName: 'पशु चिकित्सक', category: 'Healthcare' },
  { id: 36, name: 'Physiotherapist', hindiName: 'फ़िज़ियोथेरेपिस्ट', category: 'Healthcare' },
  { id: 37, name: 'Psychologist', hindiName: 'मनोवैज्ञानिक', category: 'Healthcare' },
  { id: 38, name: 'Psychiatrist', hindiName: 'मनोचिकित्सक', category: 'Healthcare' },
  { id: 39, name: 'Optometrist', hindiName: 'ऑप्टोमेट्रिस्ट', category: 'Healthcare' },
  { id: 40, name: 'Midwife', hindiName: 'दाई', category: 'Healthcare' },
  { id: 41, name: 'Paramedic', hindiName: 'पैरामेडिक', category: 'Healthcare' },
  { id: 42, name: 'Lab Technician', hindiName: 'प्रयोगशाला तकनीशियन', category: 'Healthcare' },
  { id: 43, name: 'Ayurvedic Doctor', hindiName: 'वैद्य', category: 'Healthcare' },
  { id: 44, name: 'Homeopath', hindiName: 'होम्योपैथ', category: 'Healthcare' },
  { id: 45, name: 'Nutritionist', hindiName: 'पोषण विशेषज्ञ', category: 'Healthcare' },
  { id: 46, name: 'Dietitian', hindiName: 'आहार विशेषज्ञ', category: 'Healthcare' },
  { id: 47, name: 'Ward Boy', hindiName: 'वार्ड बॉय', category: 'Healthcare' },
  { id: 48, name: 'Caregiver', hindiName: 'देखभालकर्ता', category: 'Healthcare' },
  { id: 49, name: 'Medical Representative', hindiName: 'मेडिकल रिप्रेजेंटेटिव', category: 'Healthcare' },
  { id: 50, name: 'Hospital Administrator', hindiName: 'अस्पताल प्रशासक', category: 'Healthcare' },
  { id: 51, name: 'Ambulance Driver', hindiName: 'एम्बुलेंस चालक', category: 'Healthcare' },

  // 3. Education
  { id: 60, name: 'Teacher', hindiName: 'शिक्षक', category: 'Education' },
  { id: 61, name: 'Professor', hindiName: 'प्रोफ़ेसर', category: 'Education' },
  { id: 62, name: 'Lecturer', hindiName: 'व्याख्याता', category: 'Education' },
  { id: 63, name: 'Principal', hindiName: 'प्राचार्य', category: 'Education' },
  { id: 64, name: 'Tutor', hindiName: 'ट्यूटर', category: 'Education' },
  { id: 65, name: 'Instructor', hindiName: 'अनुदेशक', category: 'Education' },
  { id: 66, name: 'Trainer', hindiName: 'प्रशिक्षक', category: 'Education' },
  { id: 67, name: 'Librarian', hindiName: 'पुस्तकालयाध्यक्ष', category: 'Education' },
  { id: 68, name: 'Lab Assistant', hindiName: 'प्रयोगशाला सहायक', category: 'Education' },
  { id: 69, name: 'Counsellor', hindiName: 'परामर्शदाता', category: 'Education' },
  { id: 70, name: 'Translator', hindiName: 'अनुवादक', category: 'Education' },
  { id: 71, name: 'Interpreter', hindiName: 'दुभाषिया', category: 'Education' },
  { id: 72, name: 'Student', hindiName: 'विद्यार्थी', category: 'Education' },
  { id: 73, name: 'School Student', hindiName: 'स्कूली छात्र', category: 'Education' },
  { id: 74, name: 'College Student', hindiName: 'महाविद्यालय छात्र', category: 'Education' },

  // 4. Engineering
  { id: 80, name: 'Engineer', hindiName: 'इंजीनियर (अभियंता)', category: 'Engineering' },
  { id: 81, name: 'Civil Engineer', hindiName: 'सिविल इंजीनियर', category: 'Engineering' },
  { id: 82, name: 'Mechanical Engineer', hindiName: 'मैकेनिकल इंजीनियर', category: 'Engineering' },
  { id: 83, name: 'Electrical Engineer', hindiName: 'इलेक्ट्रिकल इंजीनियर', category: 'Engineering' },
  { id: 84, name: 'Chemical Engineer', hindiName: 'केमिकल इंजीनियर', category: 'Engineering' },
  { id: 85, name: 'Architect', hindiName: 'वास्तुकार', category: 'Engineering' },
  { id: 86, name: 'Draftsman', hindiName: 'ड्राफ़्ट्समैन', category: 'Engineering' },
  { id: 87, name: 'Surveyor', hindiName: 'सर्वेक्षक', category: 'Engineering' },

  // 5. Information Technology
  { id: 90, name: 'Software Developer', hindiName: 'सॉफ़्टवेयर डेवलपर', category: 'Information Technology' },
  { id: 91, name: 'Programmer', hindiName: 'प्रोग्रामर', category: 'Information Technology' },
  { id: 92, name: 'Web Developer', hindiName: 'वेब डेवलपर', category: 'Information Technology' },
  { id: 93, name: 'Data Scientist', hindiName: 'डेटा साइंटिस्ट', category: 'Information Technology' },
  { id: 94, name: 'Data Analyst', hindiName: 'डेटा विश्लेषक', category: 'Information Technology' },
  { id: 95, name: 'Computer Operator', hindiName: 'कंप्यूटर ऑपरेटर', category: 'Information Technology' },
  { id: 96, name: 'Data Entry Operator', hindiName: 'डेटा एंट्री ऑपरेटर', category: 'Information Technology' },
  { id: 97, name: 'Cyber Security Expert', hindiName: 'साइबर सुरक्षा विशेषज्ञ', category: 'Information Technology' },
  { id: 98, name: 'IT Support Specialist', hindiName: 'आईटी सहायता विशेषज्ञ', category: 'Information Technology' },
  { id: 99, name: 'System Administrator', hindiName: 'सिस्टम एडमिनिस्ट्रेटर', category: 'Information Technology' },

  // 6. Science and Research
  { id: 110, name: 'Scientist', hindiName: 'वैज्ञानिक', category: 'Science and Research' },
  { id: 111, name: 'Researcher', hindiName: 'शोधकर्ता', category: 'Science and Research' },
  { id: 112, name: 'Research Scholar', hindiName: 'शोधार्थी', category: 'Science and Research' },
  { id: 113, name: 'Mathematician', hindiName: 'गणितज्ञ', category: 'Science and Research' },
  { id: 114, name: 'Statistician', hindiName: 'सांख्यिकीविद्', category: 'Science and Research' },
  { id: 115, name: 'Economist', hindiName: 'अर्थशास्त्री', category: 'Science and Research' },
  { id: 116, name: 'Historian', hindiName: 'इतिहासकार', category: 'Science and Research' },
  { id: 117, name: 'Archaeologist', hindiName: 'पुरातत्वविद्', category: 'Science and Research' },
  { id: 118, name: 'Anthropologist', hindiName: 'मानवविज्ञानी', category: 'Science and Research' },
  { id: 119, name: 'Geologist', hindiName: 'भूवैज्ञानिक', category: 'Science and Research' },
  { id: 120, name: 'Astronomer', hindiName: 'खगोलशास्त्री', category: 'Science and Research' },
  { id: 121, name: 'Astronaut', hindiName: 'अंतरिक्ष यात्री', category: 'Science and Research' },
  { id: 122, name: 'Meteorologist', hindiName: 'मौसम विज्ञानी', category: 'Science and Research' },
  { id: 123, name: 'Environmentalist', hindiName: 'पर्यावरणविद्', category: 'Science and Research' },
  { id: 124, name: 'Sociologist', hindiName: 'समाजशास्त्री', category: 'Science and Research' },
  { id: 125, name: 'Linguist', hindiName: 'भाषाविद्', category: 'Science and Research' },
  { id: 126, name: 'Philosopher', hindiName: 'दार्शनिक', category: 'Science and Research' },

  // 7. Business and Entrepreneurship
  { id: 130, name: 'Businessman', hindiName: 'व्यवसायी', category: 'Business and Entrepreneurship' },
  { id: 131, name: 'Entrepreneur', hindiName: 'उद्यमी', category: 'Business and Entrepreneurship' },
  { id: 132, name: 'Industrialist', hindiName: 'उद्योगपति', category: 'Business and Entrepreneurship' },
  { id: 133, name: 'Manager', hindiName: 'प्रबंधक', category: 'Business and Entrepreneurship' },
  { id: 134, name: 'Project Manager', hindiName: 'परियोजना प्रबंधक', category: 'Business and Entrepreneurship' },
  { id: 135, name: 'Supervisor', hindiName: 'पर्यवेक्षक', category: 'Business and Entrepreneurship' },
  { id: 136, name: 'Director', hindiName: 'निदेशक', category: 'Business and Entrepreneurship' },
  { id: 137, name: 'Chief Executive Officer', hindiName: 'मुख्य कार्यकारी अधिकारी', category: 'Business and Entrepreneurship' },
  { id: 138, name: 'Administrator', hindiName: 'प्रशासक', category: 'Business and Entrepreneurship' },
  { id: 139, name: 'Secretary', hindiName: 'सचिव', category: 'Business and Entrepreneurship' },
  { id: 140, name: 'Personal Assistant', hindiName: 'निजी सहायक', category: 'Business and Entrepreneurship' },
  { id: 141, name: 'Receptionist', hindiName: 'स्वागतकर्ता (रिसेप्शनिस्ट)', category: 'Business and Entrepreneurship' },
  { id: 142, name: 'Clerk', hindiName: 'लिपिक (क्लर्क)', category: 'Business and Entrepreneurship' },
  { id: 143, name: 'Office Assistant', hindiName: 'कार्यालय सहायक', category: 'Business and Entrepreneurship' },
  { id: 144, name: 'Business Analyst', hindiName: 'व्यवसाय विश्लेषक', category: 'Business and Entrepreneurship' },
  { id: 145, name: 'Moneylender', hindiName: 'साहूकार', category: 'Business and Entrepreneurship' },
  { id: 146, name: 'Human Resources Executive', hindiName: 'मानव संसाधन अधिकारी', category: 'Business and Entrepreneurship' },
  { id: 147, name: 'Marketing Executive', hindiName: 'विपणन अधिकारी', category: 'Business and Entrepreneurship' },
  { id: 148, name: 'Sales Executive', hindiName: 'बिक्री अधिकारी', category: 'Business and Entrepreneurship' },
  { id: 149, name: 'Consultant', hindiName: 'सलाहकार', category: 'Business and Entrepreneurship' },
  { id: 150, name: 'Self-Employed', hindiName: 'स्व-रोज़गारी', category: 'Business and Entrepreneurship' },
  { id: 151, name: 'Freelancer', hindiName: 'फ़्रीलांसर', category: 'Business and Entrepreneurship' },

  // 8. Finance and Banking
  { id: 160, name: 'Banker', hindiName: 'बैंककर्मी', category: 'Finance and Banking' },
  { id: 161, name: 'Bank Manager', hindiName: 'बैंक प्रबंधक', category: 'Finance and Banking' },
  { id: 162, name: 'Cashier', hindiName: 'खजांची (कैशियर)', category: 'Finance and Banking' },
  { id: 163, name: 'Accountant', hindiName: 'लेखाकार', category: 'Finance and Banking' },
  { id: 164, name: 'Chartered Accountant', hindiName: 'चार्टर्ड अकाउंटेंट', category: 'Finance and Banking' },
  { id: 165, name: 'Auditor', hindiName: 'लेखा परीक्षक', category: 'Finance and Banking' },
  { id: 166, name: 'Insurance Agent', hindiName: 'बीमा एजेंट', category: 'Finance and Banking' },
  { id: 167, name: 'Stock Broker', hindiName: 'शेयर दलाल', category: 'Finance and Banking' },
  { id: 168, name: 'Financial Advisor', hindiName: 'वित्तीय सलाहकार', category: 'Finance and Banking' },
  { id: 169, name: 'Tax Consultant', hindiName: 'कर सलाहकार', category: 'Finance and Banking' },

  // 9. Law and Legal Services
  { id: 175, name: 'Lawyer', hindiName: 'वकील', category: 'Law and Legal Services' },
  { id: 176, name: 'Advocate', hindiName: 'अधिवक्ता', category: 'Law and Legal Services' },
  { id: 177, name: 'Legal Advisor', hindiName: 'कानूनी सलाहकार', category: 'Law and Legal Services' },
  { id: 178, name: 'Notary', hindiName: 'नोटरी', category: 'Law and Legal Services' },
  { id: 179, name: 'Judge', hindiName: 'न्यायाधीश', category: 'Law and Legal Services' },
  { id: 180, name: 'Magistrate', hindiName: 'दंडाधिकारी (मजिस्ट्रेट)', category: 'Law and Legal Services' },

  // 10. Government Services
  { id: 185, name: 'Government Employee', hindiName: 'सरकारी कर्मचारी', category: 'Government Services' },
  { id: 186, name: 'Civil Servant', hindiName: 'लोक सेवक', category: 'Government Services' },
  { id: 187, name: 'Politician', hindiName: 'राजनेता', category: 'Government Services' },
  { id: 188, name: 'Minister', hindiName: 'मंत्री', category: 'Government Services' },
  { id: 189, name: 'Mayor', hindiName: 'महापौर', category: 'Government Services' },
  { id: 190, name: 'Sarpanch', hindiName: 'सरपंच', category: 'Government Services' },
  { id: 191, name: 'Patwari', hindiName: 'पटवारी', category: 'Government Services' },
  { id: 192, name: 'Customs Officer', hindiName: 'सीमा शुल्क अधिकारी', category: 'Government Services' },
  { id: 193, name: 'Tax Officer', hindiName: 'कर अधिकारी', category: 'Government Services' },
  { id: 194, name: 'Revenue Officer', hindiName: 'राजस्व अधिकारी', category: 'Government Services' },
  { id: 195, name: 'Diplomat', hindiName: 'राजनयिक', category: 'Government Services' },
  { id: 196, name: 'Ambassador', hindiName: 'राजदूत', category: 'Government Services' },

  // 11. Defence and Military
  { id: 200, name: 'Soldier', hindiName: 'सैनिक', category: 'Defence and Military' },
  { id: 201, name: 'Army Officer', hindiName: 'सेना अधिकारी', category: 'Defence and Military' },
  { id: 202, name: 'Navy Officer', hindiName: 'नौसेना अधिकारी', category: 'Defence and Military' },
  { id: 203, name: 'Air Force Officer', hindiName: 'वायुसेना अधिकारी', category: 'Defence and Military' },
  { id: 204, name: 'Border Security Personnel', hindiName: 'सीमा सुरक्षा कर्मी', category: 'Defence and Military' },

  // 12. Police and Security
  { id: 210, name: 'Police Officer', hindiName: 'पुलिस अधिकारी', category: 'Police and Security' },
  { id: 211, name: 'Police Constable', hindiName: 'पुलिस सिपाही', category: 'Police and Security' },
  { id: 212, name: 'Detective', hindiName: 'जासूस (गुप्तचर)', category: 'Police and Security' },
  { id: 213, name: 'Intelligence Officer', hindiName: 'खुफ़िया अधिकारी', category: 'Police and Security' },
  { id: 214, name: 'Home Guard', hindiName: 'होमगार्ड', category: 'Police and Security' },
  { id: 215, name: 'Security Guard', hindiName: 'सुरक्षा गार्ड', category: 'Police and Security' },
  { id: 216, name: 'Bodyguard', hindiName: 'अंगरक्षक', category: 'Police and Security' },
  { id: 217, name: 'Watchman', hindiName: 'चौकीदार', category: 'Police and Security' },
  { id: 218, name: 'Firefighter', hindiName: 'अग्निशमन कर्मी', category: 'Police and Security' },
  { id: 219, name: 'Jailer', hindiName: 'जेलर', category: 'Police and Security' },

  // 13. Construction and Real Estate
  { id: 225, name: 'Builder', hindiName: 'भवन निर्माता', category: 'Construction and Real Estate' },
  { id: 226, name: 'Contractor', hindiName: 'ठेकेदार', category: 'Construction and Real Estate' },
  { id: 227, name: 'Mason', hindiName: 'राजमिस्त्री', category: 'Construction and Real Estate' },
  { id: 228, name: 'Carpenter', hindiName: 'बढ़ई', category: 'Construction and Real Estate' },
  { id: 229, name: 'Plumber', hindiName: 'प्लंबर (नलसाज़)', category: 'Construction and Real Estate' },
  { id: 230, name: 'Welder', hindiName: 'वेल्डर', category: 'Construction and Real Estate' },
  { id: 231, name: 'House Painter', hindiName: 'रंगसाज़', category: 'Construction and Real Estate' },
  { id: 232, name: 'Tile Fitter', hindiName: 'टाइल मिस्त्री', category: 'Construction and Real Estate' },
  { id: 233, name: 'Glass Fitter', hindiName: 'काँच मिस्त्री', category: 'Construction and Real Estate' },
  { id: 234, name: 'Real Estate Agent', hindiName: 'प्रॉपर्टी डीलर', category: 'Construction and Real Estate' },
  { id: 235, name: 'Construction Worker', hindiName: 'निर्माण मज़दूर', category: 'Construction and Real Estate' },

  // 14. Manufacturing and Industry
  { id: 240, name: 'Factory Worker', hindiName: 'कारखाना मज़दूर', category: 'Manufacturing and Industry' },
  { id: 241, name: 'Mill Worker', hindiName: 'मिल मज़दूर', category: 'Manufacturing and Industry' },
  { id: 242, name: 'Machine Operator', hindiName: 'मशीन ऑपरेटर', category: 'Manufacturing and Industry' },
  { id: 243, name: 'Boiler Operator', hindiName: 'बॉयलर ऑपरेटर', category: 'Manufacturing and Industry' },
  { id: 244, name: 'Packer', hindiName: 'पैकर', category: 'Manufacturing and Industry' },
  { id: 245, name: 'Store Keeper', hindiName: 'भंडारी (स्टोरकीपर)', category: 'Manufacturing and Industry' },
  { id: 246, name: 'Quality Inspector', hindiName: 'गुणवत्ता निरीक्षक', category: 'Manufacturing and Industry' },
  { id: 247, name: 'Brick Kiln Worker', hindiName: 'ईंट भट्ठा मज़दूर', category: 'Manufacturing and Industry' },
  { id: 248, name: 'Foreman', hindiName: 'फ़ोरमैन (मुकादम)', category: 'Manufacturing and Industry' },

  // 15. Skilled Trades and Repair
  { id: 255, name: 'Electrician', hindiName: 'इलेक्ट्रीशियन (बिजली मिस्त्री)', category: 'Skilled Trades and Repair' },
  { id: 256, name: 'Mechanic', hindiName: 'मैकेनिक (मिस्त्री)', category: 'Skilled Trades and Repair' },
  { id: 257, name: 'AC Technician', hindiName: 'एसी तकनीशियन', category: 'Skilled Trades and Repair' },
  { id: 258, name: 'Fitter', hindiName: 'फ़िटर', category: 'Skilled Trades and Repair' },
  { id: 259, name: 'Turner', hindiName: 'टर्नर', category: 'Skilled Trades and Repair' },
  { id: 260, name: 'Machinist', hindiName: 'मशीनिस्ट', category: 'Skilled Trades and Repair' },
  { id: 261, name: 'Crane Operator', hindiName: 'क्रेन ऑपरेटर', category: 'Skilled Trades and Repair' },
  { id: 262, name: 'Heavy Machinery Operator', hindiName: 'भारी मशीन चालक', category: 'Skilled Trades and Repair' },
  { id: 263, name: 'Stone Cutter', hindiName: 'पत्थर तराशने वाला', category: 'Skilled Trades and Repair' },
  { id: 264, name: 'Locksmith', hindiName: 'ताला मिस्त्री', category: 'Skilled Trades and Repair' },
  { id: 265, name: 'Furniture Maker', hindiName: 'फ़र्नीचर कारीगर', category: 'Skilled Trades and Repair' },
  { id: 266, name: 'Fabricator', hindiName: 'फ़ैब्रिकेटर', category: 'Skilled Trades and Repair' },
  { id: 267, name: 'Blacksmith', hindiName: 'लोहार', category: 'Skilled Trades and Repair' },
  { id: 268, name: 'Goldsmith', hindiName: 'सुनार', category: 'Skilled Trades and Repair' },
  { id: 269, name: 'Bangle Maker', hindiName: 'चूड़ी कारीगर', category: 'Skilled Trades and Repair' },
  { id: 270, name: 'Basket Weaver', hindiName: 'टोकरी बुनकर', category: 'Skilled Trades and Repair' },
  { id: 271, name: 'Handicraft Artisan', hindiName: 'हस्तशिल्प कारीगर', category: 'Skilled Trades and Repair' },
  { id: 272, name: 'Bookbinder', hindiName: 'जिल्दसाज़', category: 'Skilled Trades and Repair' },
  { id: 273, name: 'Printer', hindiName: 'मुद्रक (प्रिंटर)', category: 'Skilled Trades and Repair' },
  { id: 274, name: 'Watchmaker', hindiName: 'घड़ीसाज़', category: 'Skilled Trades and Repair' },
  { id: 275, name: 'Washerman', hindiName: 'धोबी', category: 'Skilled Trades and Repair' },
  { id: 276, name: 'Cobbler', hindiName: 'मोची', category: 'Skilled Trades and Repair' },
  { id: 277, name: 'Leather Worker', hindiName: 'चर्मकार', category: 'Skilled Trades and Repair' },
  { id: 278, name: 'Potter', hindiName: 'कुम्हार', category: 'Skilled Trades and Repair' },
  { id: 279, name: 'Puncture Repairer', hindiName: 'पंक्चर बनाने वाला', category: 'Skilled Trades and Repair' },

  // 16. Transport and Logistics
  { id: 285, name: 'Driver', hindiName: 'चालक', category: 'Transport and Logistics' },
  { id: 286, name: 'Taxi Driver', hindiName: 'टैक्सी चालक', category: 'Transport and Logistics' },
  { id: 287, name: 'Truck Driver', hindiName: 'ट्रक चालक', category: 'Transport and Logistics' },
  { id: 288, name: 'Bus Driver', hindiName: 'बस चालक', category: 'Transport and Logistics' },
  { id: 289, name: 'Auto Rickshaw Driver', hindiName: 'ऑटो रिक्शा चालक', category: 'Transport and Logistics' },
  { id: 290, name: 'Rickshaw Puller', hindiName: 'रिक्शा चालक', category: 'Transport and Logistics' },
  { id: 291, name: 'Bus Conductor', hindiName: 'बस कंडक्टर', category: 'Transport and Logistics' },
  { id: 292, name: 'Train Driver', hindiName: 'लोको पायलट', category: 'Transport and Logistics' },
  { id: 293, name: 'Railway Guard', hindiName: 'रेलवे गार्ड', category: 'Transport and Logistics' },
  { id: 294, name: 'Station Master', hindiName: 'स्टेशन मास्टर', category: 'Transport and Logistics' },
  { id: 295, name: 'Ticket Checker', hindiName: 'टिकट निरीक्षक', category: 'Transport and Logistics' },
  { id: 296, name: 'Pilot', hindiName: 'पायलट (विमान चालक)', category: 'Transport and Logistics' },
  { id: 297, name: 'Flight Attendant', hindiName: 'विमान परिचारक / परिचारिका', category: 'Transport and Logistics' },
  { id: 298, name: 'Air Traffic Controller', hindiName: 'हवाई यातायात नियंत्रक', category: 'Transport and Logistics' },
  { id: 299, name: 'Sailor', hindiName: 'नाविक', category: 'Transport and Logistics' },
  { id: 300, name: 'Ship Captain', hindiName: 'जहाज़ कप्तान', category: 'Transport and Logistics' },
  { id: 301, name: 'Boatman', hindiName: 'मल्लाह (नाव चालक)', category: 'Transport and Logistics' },
  { id: 302, name: 'Porter', hindiName: 'कुली', category: 'Transport and Logistics' },
  { id: 303, name: 'Delivery Person', hindiName: 'डिलीवरी कर्मी', category: 'Transport and Logistics' },
  { id: 304, name: 'Courier', hindiName: 'कूरियर कर्मी', category: 'Transport and Logistics' },
  { id: 305, name: 'Postman', hindiName: 'डाकिया', category: 'Transport and Logistics' },
  { id: 306, name: 'Postmaster', hindiName: 'डाकपाल', category: 'Transport and Logistics' },
  { id: 307, name: 'Warehouse Worker', hindiName: 'गोदाम कर्मचारी', category: 'Transport and Logistics' },
  { id: 308, name: 'Loader', hindiName: 'लोडर (भारवाहक)', category: 'Transport and Logistics' },
  { id: 309, name: 'Parking Attendant', hindiName: 'पार्किंग कर्मचारी', category: 'Transport and Logistics' },
  { id: 310, name: 'Toll Collector', hindiName: 'टोल कर्मचारी', category: 'Transport and Logistics' },
  { id: 311, name: 'Petrol Pump Attendant', hindiName: 'पेट्रोल पंप कर्मचारी', category: 'Transport and Logistics' },
  { id: 312, name: 'Driving Instructor', hindiName: 'ड्राइविंग प्रशिक्षक', category: 'Transport and Logistics' },
  { id: 313, name: 'Logistics Manager', hindiName: 'लॉजिस्टिक्स प्रबंधक', category: 'Transport and Logistics' },
  { id: 314, name: 'Car Washer', hindiName: 'कार धुलाई कर्मी', category: 'Transport and Logistics' },

  // 17. Retail and Trade
  { id: 320, name: 'Shopkeeper', hindiName: 'दुकानदार', category: 'Retail and Trade' },
  { id: 321, name: 'Trader', hindiName: 'व्यापारी', category: 'Retail and Trade' },
  { id: 322, name: 'Wholesaler', hindiName: 'थोक व्यापारी', category: 'Retail and Trade' },
  { id: 323, name: 'Retailer', hindiName: 'खुदरा विक्रेता', category: 'Retail and Trade' },
  { id: 324, name: 'Distributor', hindiName: 'वितरक', category: 'Retail and Trade' },
  { id: 325, name: 'Salesperson', hindiName: 'विक्रेता (सेल्समैन)', category: 'Retail and Trade' },
  { id: 326, name: 'Store Manager', hindiName: 'स्टोर प्रबंधक', category: 'Retail and Trade' },
  { id: 327, name: 'Grocer', hindiName: 'किराना व्यापारी', category: 'Retail and Trade' },
  { id: 328, name: 'Textile Merchant', hindiName: 'कपड़ा व्यापारी', category: 'Retail and Trade' },
  { id: 329, name: 'Jeweller', hindiName: 'जौहरी', category: 'Retail and Trade' },
  { id: 330, name: 'Bookseller', hindiName: 'पुस्तक विक्रेता', category: 'Retail and Trade' },
  { id: 331, name: 'Newspaper Vendor', hindiName: 'अख़बार विक्रेता', category: 'Retail and Trade' },
  { id: 332, name: 'Florist', hindiName: 'फूल विक्रेता', category: 'Retail and Trade' },
  { id: 333, name: 'Vegetable Vendor', hindiName: 'सब्ज़ी विक्रेता', category: 'Retail and Trade' },
  { id: 334, name: 'Fruit Seller', hindiName: 'फल विक्रेता', category: 'Retail and Trade' },
  { id: 335, name: 'Street Vendor', hindiName: 'फेरीवाला', category: 'Retail and Trade' },
  { id: 336, name: 'Scrap Dealer', hindiName: 'कबाड़ी', category: 'Retail and Trade' },
  { id: 337, name: 'Pan Shop Owner', hindiName: 'पान विक्रेता', category: 'Retail and Trade' },
  { id: 338, name: 'Fishmonger', hindiName: 'मछली विक्रेता', category: 'Retail and Trade' },
  { id: 339, name: 'Butcher', hindiName: 'कसाई', category: 'Retail and Trade' },
  { id: 340, name: 'Milkman', hindiName: 'दूधवाला', category: 'Retail and Trade' },
  { id: 341, name: 'Auctioneer', hindiName: 'नीलामकता', category: 'Retail and Trade' },

  // 18. Hospitality and Tourism
  { id: 345, name: 'Hotel Manager', hindiName: 'होटल प्रबंधक', category: 'Hospitality and Tourism' },
  { id: 346, name: 'Bellboy', hindiName: 'बेलबॉय', category: 'Hospitality and Tourism' },
  { id: 347, name: 'Housekeeping Staff', hindiName: 'हाउसकीपिंग कर्मचारी', category: 'Hospitality and Tourism' },
  { id: 348, name: 'Tour Guide', hindiName: 'पर्यटक गाइड', category: 'Hospitality and Tourism' },
  { id: 349, name: 'Travel Agent', hindiName: 'ट्रैवल एजेंट', category: 'Hospitality and Tourism' },
  { id: 350, name: 'Event Planner', hindiName: 'इवेंट प्लानर', category: 'Hospitality and Tourism' },

  // 19. Food and Catering
  { id: 355, name: 'Chef', hindiName: 'शेफ (मुख्य रसोइया)', category: 'Food and Catering' },
  { id: 356, name: 'Cook', hindiName: 'रसोइया', category: 'Food and Catering' },
  { id: 357, name: 'Baker', hindiName: 'बेकर (नानबाई)', category: 'Food and Catering' },
  { id: 358, name: 'Sweet Maker', hindiName: 'हलवाई', category: 'Food and Catering' },
  { id: 359, name: 'Waiter', hindiName: 'वेटर', category: 'Food and Catering' },
  { id: 360, name: 'Bartender', hindiName: 'बारटेंडर', category: 'Food and Catering' },
  { id: 361, name: 'Caterer', hindiName: 'कैटरर (खानपान सेवक)', category: 'Food and Catering' },
  { id: 362, name: 'Restaurant Owner', hindiName: 'रेस्तरां मालिक', category: 'Food and Catering' },
  { id: 363, name: 'Dhaba Owner', hindiName: 'ढाबा मालिक', category: 'Food and Catering' },
  { id: 364, name: 'Tea Seller', hindiName: 'चायवाला', category: 'Food and Catering' },
  { id: 365, name: 'Tiffin Service Provider', hindiName: 'टिफ़िन सेवा प्रदाता', category: 'Food and Catering' },

  // 20. Media and Journalism
  { id: 370, name: 'Journalist', hindiName: 'पत्रकार', category: 'Media and Journalism' },
  { id: 371, name: 'Reporter', hindiName: 'संवाददाता', category: 'Media and Journalism' },
  { id: 372, name: 'Editor', hindiName: 'संपादक', category: 'Media and Journalism' },
  { id: 373, name: 'News Anchor', hindiName: 'समाचार वाचक', category: 'Media and Journalism' },
  { id: 374, name: 'Radio Jockey', hindiName: 'रेडियो जॉकी', category: 'Media and Journalism' },
  { id: 375, name: 'Writer', hindiName: 'लेखक', category: 'Media and Journalism' },
  { id: 376, name: 'Poet', hindiName: 'कवि', category: 'Media and Journalism' },
  { id: 377, name: 'Novelist', hindiName: 'उपन्यासकार', category: 'Media and Journalism' },
  { id: 378, name: 'Proofreader', hindiName: 'प्रूफ़रीडर', category: 'Media and Journalism' },
  { id: 379, name: 'Publisher', hindiName: 'प्रकाशक', category: 'Media and Journalism' },

  // 21. Arts and Entertainment
  { id: 385, name: 'Artist', hindiName: 'कलाकार', category: 'Arts and Entertainment' },
  { id: 386, name: 'Painter', hindiName: 'चित्रकार', category: 'Arts and Entertainment' },
  { id: 387, name: 'Sculptor', hindiName: 'मूर्तिकार', category: 'Arts and Entertainment' },
  { id: 388, name: 'Singer', hindiName: 'गायक', category: 'Arts and Entertainment' },
  { id: 389, name: 'Musician', hindiName: 'संगीतकार', category: 'Arts and Entertainment' },
  { id: 390, name: 'Dancer', hindiName: 'नर्तक', category: 'Arts and Entertainment' },
  { id: 391, name: 'Choreographer', hindiName: 'नृत्य निर्देशक', category: 'Arts and Entertainment' },
  { id: 392, name: 'Actor', hindiName: 'अभिनेता', category: 'Arts and Entertainment' },
  { id: 393, name: 'Actress', hindiName: 'अभिनेत्री', category: 'Arts and Entertainment' },
  { id: 394, name: 'Model', hindiName: 'मॉडल', category: 'Arts and Entertainment' },
  { id: 395, name: 'Film Director', hindiName: 'फ़िल्म निर्देशक', category: 'Arts and Entertainment' },
  { id: 396, name: 'Film Producer', hindiName: 'फ़िल्म निर्माता', category: 'Arts and Entertainment' },
  { id: 397, name: 'Photographer', hindiName: 'छायाकार (फ़ोटोग्राफ़र)', category: 'Arts and Entertainment' },
  { id: 398, name: 'Videographer', hindiName: 'वीडियो ग्राफ़र', category: 'Arts and Entertainment' },
  { id: 399, name: 'Video Editor', hindiName: 'वीडियो संपादक', category: 'Arts and Entertainment' },
  { id: 400, name: 'Event Host', hindiName: 'कार्यक्रम संचालक', category: 'Arts and Entertainment' },
  { id: 401, name: 'Comedian', hindiName: 'हास्य कलाकार', category: 'Arts and Entertainment' },
  { id: 402, name: 'Magician', hindiName: 'जादूगर', category: 'Arts and Entertainment' },
  { id: 403, name: 'DJ', hindiName: 'डीजे', category: 'Arts and Entertainment' },
  { id: 404, name: 'Voice Artist', hindiName: 'आवाज़ कलाकार', category: 'Arts and Entertainment' },
  { id: 405, name: 'Folk Artist', hindiName: 'लोक कलाकार', category: 'Arts and Entertainment' },
  { id: 406, name: 'Circus Performer', hindiName: 'सर्कस कलाकार', category: 'Arts and Entertainment' },
  { id: 407, name: 'Puppeteer', hindiName: 'कठपुतली कलाकार', category: 'Arts and Entertainment' },

  // 22. Design and Fashion
  { id: 415, name: 'Graphic Designer', hindiName: 'ग्राफ़िक डिज़ाइनर', category: 'Design and Fashion' },
  { id: 416, name: 'Animator', hindiName: 'एनिमेटर', category: 'Design and Fashion' },
  { id: 417, name: 'Fashion Designer', hindiName: 'फ़ैशन डिज़ाइनर', category: 'Design and Fashion' },
  { id: 418, name: 'Interior Designer', hindiName: 'इंटीरियर डिज़ाइनर', category: 'Design and Fashion' },
  { id: 419, name: 'Cartoonist', hindiName: 'कार्टूनिस्ट', category: 'Design and Fashion' },
  { id: 420, name: 'Tailor', hindiName: 'दर्जी', category: 'Design and Fashion' },
  { id: 421, name: 'Weaver', hindiName: 'बुनकर', category: 'Design and Fashion' },
  { id: 422, name: 'Carpet Weaver', hindiName: 'कालीन बुनकर', category: 'Design and Fashion' },
  { id: 423, name: 'Embroiderer', hindiName: 'कढ़ाई कारीगर', category: 'Design and Fashion' },
  { id: 424, name: 'Dyer', hindiName: 'रंगरेज़', category: 'Design and Fashion' },
  { id: 425, name: 'Garment Worker', hindiName: 'परिधान कारखाना कर्मचारी', category: 'Design and Fashion' },

  // 23. Beauty and Personal Care
  { id: 430, name: 'Makeup Artist', hindiName: 'मेकअप आर्टिस्ट', category: 'Beauty and Personal Care' },
  { id: 431, name: 'Barber', hindiName: 'नाई', category: 'Beauty and Personal Care' },
  { id: 432, name: 'Hairdresser', hindiName: 'हेयरड्रेसर', category: 'Beauty and Personal Care' },
  { id: 433, name: 'Beautician', hindiName: 'ब्यूटीशियन', category: 'Beauty and Personal Care' },
  { id: 434, name: 'Masseur', hindiName: 'मालिश करने वाला', category: 'Beauty and Personal Care' },

  // 24. Sports and Fitness
  { id: 440, name: 'Sportsperson', hindiName: 'खिलाड़ी', category: 'Sports and Fitness' },
  { id: 441, name: 'Athlete', hindiName: 'एथलीट', category: 'Sports and Fitness' },
  { id: 442, name: 'Cricketer', hindiName: 'क्रिकेटर', category: 'Sports and Fitness' },
  { id: 443, name: 'Footballer', hindiName: 'फ़ुटबॉल खिलाड़ी', category: 'Sports and Fitness' },
  { id: 444, name: 'Wrestler', hindiName: 'पहलवान', category: 'Sports and Fitness' },
  { id: 445, name: 'Boxer', hindiName: 'मुक्केबाज़', category: 'Sports and Fitness' },
  { id: 446, name: 'Coach', hindiName: 'कोच', category: 'Sports and Fitness' },
  { id: 447, name: 'Referee', hindiName: 'रेफ़री (पंच)', category: 'Sports and Fitness' },
  { id: 448, name: 'Gym Trainer', hindiName: 'जिम प्रशिक्षक', category: 'Sports and Fitness' },
  { id: 449, name: 'Yoga Instructor', hindiName: 'योग प्रशिक्षक', category: 'Sports and Fitness' },
  { id: 450, name: 'Mountaineer', hindiName: 'पर्वतारोही', category: 'Sports and Fitness' },
  { id: 451, name: 'Lifeguard', hindiName: 'जीवन रक्षक', category: 'Sports and Fitness' },
  { id: 452, name: 'Sports Commentator', hindiName: 'खेल टिप्पणीकार', category: 'Sports and Fitness' },

  // 25. Social Work and NGOs
  { id: 460, name: 'Social Worker', hindiName: 'समाज सेवक', category: 'Social Work and NGOs' },
  { id: 461, name: 'NGO Worker', hindiName: 'एनजीओ कार्यकर्ता', category: 'Social Work and NGOs' },
  { id: 462, name: 'Activist', hindiName: 'कार्यकर्ता', category: 'Social Work and NGOs' },
  { id: 463, name: 'Community Leader', hindiName: 'सामुदायिक नेता', category: 'Social Work and NGOs' },
  { id: 464, name: 'Volunteer', hindiName: 'स्वयंसेवक', category: 'Social Work and NGOs' },

  // 26. Energy and Utilities
  { id: 470, name: 'Power Plant Operator', hindiName: 'बिजली संयंत्र संचालक', category: 'Energy and Utilities' },
  { id: 471, name: 'Solar Technician', hindiName: 'सौर ऊर्जा तकनीशियन', category: 'Energy and Utilities' },
  { id: 472, name: 'Oil Rig Worker', hindiName: 'तेल रिग कर्मी', category: 'Energy and Utilities' },
  { id: 473, name: 'Pump Operator', hindiName: 'पंप ऑपरेटर', category: 'Energy and Utilities' },
  { id: 474, name: 'Lineman', hindiName: 'लाइनमैन', category: 'Energy and Utilities' },
  { id: 475, name: 'Meter Reader', hindiName: 'मीटर रीडर', category: 'Energy and Utilities' },
  { id: 476, name: 'Miner', hindiName: 'खनिक', category: 'Energy and Utilities' },
  { id: 477, name: 'Quarry Worker', hindiName: 'खदान मज़दूर', category: 'Energy and Utilities' },

  // 27. Telecommunications
  { id: 480, name: 'Telecom Technician', hindiName: 'दूरसंचार तकनीशियन', category: 'Telecommunications' },
  { id: 481, name: 'Mobile Repair Technician', hindiName: 'मोबाइल मरम्मत तकनीशियन', category: 'Telecommunications' },
  { id: 482, name: 'Call Centre Agent', hindiName: 'कॉल सेंटर एजेंट', category: 'Telecommunications' },
  { id: 483, name: 'Customer Care Executive', hindiName: 'ग्राहक सेवा अधिकारी', category: 'Telecommunications' },

  // 28. Domestic and Household Services
  { id: 490, name: 'Housewife', hindiName: 'गृहिणी', category: 'Domestic and Household Services' },
  { id: 491, name: 'Househusband', hindiName: 'हाउस हसबैंड', category: 'Domestic and Household Services' },
  { id: 492, name: 'Maid', hindiName: 'घरेलू सहायिका', category: 'Domestic and Household Services' },
  { id: 493, name: 'Domestic Worker', hindiName: 'घरेलू कामगार', category: 'Domestic and Household Services' },
  { id: 494, name: 'Nanny', hindiName: 'आया', category: 'Domestic and Household Services' },
  { id: 495, name: 'Babysitter', hindiName: 'बेबी सिटर', category: 'Domestic and Household Services' },
  { id: 496, name: 'Cleaner', hindiName: 'सफ़ाईकर्मी', category: 'Domestic and Household Services' },
  { id: 497, name: 'Sweeper', hindiName: 'झाड़ूकश', category: 'Domestic and Household Services' },
  { id: 498, name: 'Sanitation Worker', hindiName: 'स्वच्छता कर्मी', category: 'Domestic and Household Services' },
  { id: 499, name: 'Garbage Collector', hindiName: 'कचरा संग्रहकर्ता', category: 'Domestic and Household Services' },
  { id: 500, name: 'Pest Control Worker', hindiName: 'कीट नियंत्रण कर्मी', category: 'Domestic and Household Services' },
  { id: 501, name: 'Gatekeeper', hindiName: 'द्वारपाल', category: 'Domestic and Household Services' },
  { id: 502, name: 'Lift Operator', hindiName: 'लिफ़्ट ऑपरेटर', category: 'Domestic and Household Services' },
  { id: 503, name: 'Rag Picker', hindiName: 'कचरा बीनने वाला', category: 'Domestic and Household Services' },

  // 29. Religious and Cultural Services
  { id: 510, name: 'Priest', hindiName: 'पुजारी', category: 'Religious and Cultural Services' },
  { id: 511, name: 'Pandit', hindiName: 'पंडित', category: 'Religious and Cultural Services' },
  { id: 512, name: 'Astrologer', hindiName: 'ज्योतिषी', category: 'Religious and Cultural Services' },
  { id: 513, name: 'Spiritual Teacher', hindiName: 'आध्यात्मिक गुरु', category: 'Religious and Cultural Services' },
  { id: 514, name: 'Imam', hindiName: 'इमाम', category: 'Religious and Cultural Services' },
  { id: 515, name: 'Pastor', hindiName: 'पादरी', category: 'Religious and Cultural Services' },
  { id: 516, name: 'Granthi', hindiName: 'ग्रंथी', category: 'Religious and Cultural Services' },
  { id: 517, name: 'Monk', hindiName: 'भिक्षु', category: 'Religious and Cultural Services' },
  { id: 518, name: 'Sadhu', hindiName: 'साधु', category: 'Religious and Cultural Services' },
  { id: 519, name: 'Museum Curator', hindiName: 'संग्रहालय क्यूरेटर', category: 'Religious and Cultural Services' },

  // 30. Digital and Online Services
  { id: 525, name: 'Blogger', hindiName: 'ब्लॉगर', category: 'Digital and Online Services' },
  { id: 526, name: 'YouTuber', hindiName: 'यूट्यूबर', category: 'Digital and Online Services' },
  { id: 527, name: 'Content Creator', hindiName: 'कंटेंट क्रिएटर', category: 'Digital and Online Services' },
  { id: 528, name: 'Influencer', hindiName: 'इन्फ़्लुएंसर', category: 'Digital and Online Services' },
  { id: 529, name: 'Digital Marketer', hindiName: 'डिजिटल मार्केटर', category: 'Digital and Online Services' },
  { id: 530, name: 'Online Seller', hindiName: 'ऑनलाइन विक्रेता', category: 'Digital and Online Services' },
  { id: 531, name: 'Typist', hindiName: 'टंकक (टाइपिस्ट)', category: 'Digital and Online Services' },
  { id: 532, name: 'Stenographer', hindiName: 'आशुलिपिक', category: 'Digital and Online Services' },
] as const

/**
 * Returns list of specific occupations belonging to a given category.
 */
export function getOccupationsForCategory(category: string): readonly SpecificOccupationItem[] {
  if (!category) return []
  return SPECIFIC_OCCUPATIONS.filter(
    (occ) => occ.category.toLowerCase() === category.trim().toLowerCase()
  )
}

/**
 * Detects category for a given occupation name.
 */
export function getCategoryForOccupation(occupationName?: string | null): OccupationCategory | null {
  if (!occupationName) return null
  const clean = occupationName.trim().toLowerCase()

  // 1. Exact match with a main category
  const directCat = OCCUPATION_CATEGORIES.find((cat) => cat.toLowerCase() === clean)
  if (directCat) return directCat

  // 2. Match with specific occupation
  const matched = SPECIFIC_OCCUPATIONS.find(
    (item) => item.name.toLowerCase() === clean || item.hindiName.toLowerCase() === clean
  )
  if (matched) return matched.category

  // 3. Partial match
  const partial = SPECIFIC_OCCUPATIONS.find(
    (item) => item.name.toLowerCase().includes(clean) || clean.includes(item.name.toLowerCase())
  )
  if (partial) return partial.category

  return null
}

export function formatOccupationDisplay(occ?: string | null): string {
  if (!occ || occ.trim() === '' || occ.trim().toLowerCase() === 'occupation pending') {
    return OCCUPATION_PENDING
  }
  return occ.trim()
}


/**
 * Validates whether an occupation string matches any known category or specific occupation.
 */
export function isValidOccupation(occupation?: string | null): boolean {
  if (!occupation || !occupation.trim()) return false
  const trimmed = occupation.trim().toLowerCase()
  if (OCCUPATION_CATEGORIES.some((c) => c.toLowerCase() === trimmed)) return true
  return SPECIFIC_OCCUPATIONS.some(
    (item) => item.name.toLowerCase() === trimmed || item.hindiName.toLowerCase() === trimmed
  )
}
