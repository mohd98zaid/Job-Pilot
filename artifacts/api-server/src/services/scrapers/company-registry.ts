// company-registry.ts — 100+ companies: India IT + GCC enterprises
// ATS types: workday | greenhouse | lever | amazon | smartrecruiters | careersUrl

export type AtsType = "workday" | "greenhouse" | "lever" | "amazon" | "smartrecruiters" | "careersUrl";

export interface Company {
  name: string;
  color: string;
  ats: AtsType;
  workdayTenant?: string;
  workdaySite?: string;
  boardToken?: string;   // greenhouse / lever board token
  srCompanyId?: string;  // smartrecruiters
  careersUrl?: string;   // fallback HTML page
  regions?: ("india" | "gcc" | "global")[];
}

export const COMPANY_REGISTRY: Company[] = [

  // ── Big Tech (Global, strong GCC/India presence) ─────────────────────────
  { name:"Microsoft",   color:"#00A4EF", ats:"workday",       workdayTenant:"microsoft",    workdaySite:"Global",                regions:["global","gcc","india"] },
  { name:"Amazon",      color:"#FF9900", ats:"amazon",                                                                           regions:["global","gcc","india"] },
  { name:"Google",      color:"#4285F4", ats:"greenhouse",    boardToken:"google_mics",                                          regions:["global","gcc","india"] },
  { name:"IBM",         color:"#1F70C1", ats:"greenhouse",    boardToken:"ibm",                                                   regions:["global","gcc","india"] },
  { name:"SAP",         color:"#0FAAFF", ats:"greenhouse",    boardToken:"sap",                                                   regions:["global","gcc","india"] },
  { name:"Oracle",      color:"#F80000", ats:"workday",       workdayTenant:"oracle",        workdaySite:"OracleCareers",         regions:["global","gcc","india"] },
  { name:"Cisco",       color:"#00BCEB", ats:"workday",       workdayTenant:"cisco",         workdaySite:"Cisco",                 regions:["global","gcc","india"] },
  { name:"Adobe",       color:"#FF0000", ats:"workday",       workdayTenant:"adobe",         workdaySite:"AdobeCareers",          regions:["global","gcc","india"] },
  { name:"Salesforce",  color:"#00A1E0", ats:"workday",       workdayTenant:"salesforce",    workdaySite:"External_Career_Site",  regions:["global","gcc","india"] },
  { name:"Nvidia",      color:"#76B900", ats:"greenhouse",    boardToken:"nvidia",                                                regions:["global","india"] },
  { name:"Intel",       color:"#0071C5", ats:"workday",       workdayTenant:"intel",         workdaySite:"External",              regions:["global","gcc"] },
  { name:"Meta",        color:"#0082FB", ats:"greenhouse",    boardToken:"metacareers",                                          regions:["global"] },
  { name:"Qualcomm",    color:"#3253DC", ats:"workday",       workdayTenant:"qualcomm",      workdaySite:"External",              regions:["global","india"] },

  // ── Big 4 / Consulting ────────────────────────────────────────────────────
  { name:"Accenture",   color:"#A100FF", ats:"workday",       workdayTenant:"accenture",     workdaySite:"AccentureCareers",      regions:["global","gcc","india"] },
  { name:"Deloitte",    color:"#86BC25", ats:"workday",       workdayTenant:"deloitte",      workdaySite:"DeloitteCareers",       regions:["global","gcc","india"] },
  { name:"PwC",         color:"#E0301E", ats:"smartrecruiters", srCompanyId:"PricewaterhouseCoopers",                            regions:["global","gcc","india"] },
  { name:"KPMG",        color:"#00338D", ats:"workday",       workdayTenant:"kpmg",          workdaySite:"KPMG_CampusRec",        regions:["global","gcc","india"] },
  { name:"EY",          color:"#FFE600", ats:"smartrecruiters", srCompanyId:"EY",                                                regions:["global","gcc","india"] },
  { name:"McKinsey",    color:"#003366", ats:"smartrecruiters", srCompanyId:"McKinseyAndCompany",                               regions:["global","gcc"] },
  { name:"BCG",         color:"#00BB00", ats:"smartrecruiters", srCompanyId:"BostonConsultingGroup",                            regions:["global","gcc"] },
  { name:"Bain",        color:"#CC0000", ats:"greenhouse",    boardToken:"bain",                                                 regions:["global","gcc"] },

  // ── Indian IT Giants ──────────────────────────────────────────────────────
  { name:"TCS",         color:"#2C2C72", ats:"careersUrl",   careersUrl:"https://ibegin.tcs.com/iBegin/",                        regions:["india","gcc"] },
  { name:"Infosys",     color:"#007CC3", ats:"workday",      workdayTenant:"infosys",        workdaySite:"Infosys",              regions:["india","gcc"] },
  { name:"Wipro",       color:"#341768", ats:"workday",      workdayTenant:"wipro",          workdaySite:"Wipro",                regions:["india","gcc"] },
  { name:"HCL Tech",    color:"#0082C8", ats:"workday",      workdayTenant:"hcltechnologies", workdaySite:"HCLTech",             regions:["india","gcc"] },
  { name:"Tech Mahindra",color:"#B11116",ats:"workday",      workdayTenant:"techmahindra",   workdaySite:"Technical_External",   regions:["india","gcc"] },
  { name:"Cognizant",   color:"#0033A0", ats:"workday",      workdayTenant:"cognizant",      workdaySite:"Cognizant_Careers",    regions:["india","gcc"] },
  { name:"Capgemini",   color:"#0070AD", ats:"workday",      workdayTenant:"capgemini",      workdaySite:"Capgemini_Careers",    regions:["india","gcc"] },
  { name:"LTIMindtree", color:"#E31837", ats:"workday",      workdayTenant:"ltimindtree",    workdaySite:"LTIMindtree",          regions:["india","gcc"] },
  { name:"Mphasis",     color:"#0047AB", ats:"workday",      workdayTenant:"mphasis",        workdaySite:"Mphasis_External",     regions:["india","gcc"] },
  { name:"Persistent",  color:"#FF6B00", ats:"workday",      workdayTenant:"persistent",     workdaySite:"External",             regions:["india"] },
  { name:"Hexaware",    color:"#ED1B2E", ats:"workday",      workdayTenant:"hexaware",       workdaySite:"External",             regions:["india","gcc"] },
  { name:"Zensar",      color:"#00205B", ats:"workday",      workdayTenant:"zensar",         workdaySite:"External",             regions:["india"] },
  { name:"Cyient",      color:"#0055A5", ats:"workday",      workdayTenant:"cyient",         workdaySite:"External",             regions:["india"] },
  { name:"NIIT Tech",   color:"#E2231A", ats:"workday",      workdayTenant:"niittech",       workdaySite:"External",             regions:["india"] },
  { name:"Mastech",     color:"#003087", ats:"workday",      workdayTenant:"mastech",        workdaySite:"External",             regions:["india"] },
  { name:"UST Global",  color:"#FF6600", ats:"workday",      workdayTenant:"ust",            workdaySite:"External",             regions:["india","gcc"] },
  { name:"Tata Elxsi",  color:"#0056A2", ats:"careersUrl",  careersUrl:"https://www.tataelxsi.com/careers",                     regions:["india"] },
  { name:"L&T Tech",    color:"#005CA9", ats:"careersUrl",  careersUrl:"https://www.ltts.com/careers",                          regions:["india","gcc"] },
  { name:"Firstsource", color:"#005DA6", ats:"workday",      workdayTenant:"firstsource",    workdaySite:"External",             regions:["india"] },
  { name:"WNS Global",  color:"#0F3274", ats:"workday",      workdayTenant:"wns",            workdaySite:"External",             regions:["india","gcc"] },
  { name:"EXL Service", color:"#003DA5", ats:"workday",      workdayTenant:"exlservice",     workdaySite:"External",             regions:["india"] },

  // ── Indian Unicorns / Tech ────────────────────────────────────────────────
  { name:"Freshworks",  color:"#2ECC71", ats:"greenhouse",   boardToken:"freshworks",                                            regions:["india"] },
  { name:"Razorpay",    color:"#3395FF", ats:"lever",        boardToken:"razorpay",                                              regions:["india"] },
  { name:"PhonePe",     color:"#5F259F", ats:"greenhouse",   boardToken:"phonepe",                                               regions:["india"] },
  { name:"Swiggy",      color:"#FC8019", ats:"greenhouse",   boardToken:"swiggy",                                                regions:["india"] },
  { name:"Zomato",      color:"#E23744", ats:"greenhouse",   boardToken:"zomato",                                                regions:["india"] },
  { name:"OLA",         color:"#3FBD51", ats:"greenhouse",   boardToken:"olacabs",                                               regions:["india"] },
  { name:"Meesho",      color:"#F43397", ats:"greenhouse",   boardToken:"meesho",                                                regions:["india"] },
  { name:"Dream11",     color:"#D32F2F", ats:"lever",        boardToken:"dream11",                                               regions:["india"] },
  { name:"Paytm",       color:"#002970", ats:"careersUrl",  careersUrl:"https://jobs.lever.co/paytm",                           regions:["india"] },
  { name:"InMobi",      color:"#F4A742", ats:"greenhouse",   boardToken:"inmobi",                                                regions:["india"] },
  { name:"Zepto",       color:"#7B2FBE", ats:"greenhouse",   boardToken:"zepto",                                                 regions:["india"] },
  { name:"Groww",       color:"#00D09C", ats:"lever",        boardToken:"groww",                                                 regions:["india"] },
  { name:"CRED",        color:"#1A1A2E", ats:"greenhouse",   boardToken:"cred",                                                  regions:["india"] },
  { name:"Atlassian",   color:"#0052CC", ats:"workday",      workdayTenant:"atlassian",      workdaySite:"External",             regions:["india","global"] },

  // ── GCC / UAE Enterprises ─────────────────────────────────────────────────
  { name:"Emirates Group",   color:"#D71921", ats:"workday",      workdayTenant:"emiratesgroup", workdaySite:"External",        regions:["gcc"] },
  { name:"ADNOC",            color:"#00805D", ats:"workday",      workdayTenant:"adnoc",         workdaySite:"ADNOC",           regions:["gcc"] },
  { name:"Etisalat (e&)",    color:"#009A44", ats:"careersUrl",  careersUrl:"https://careers.eand.com",                         regions:["gcc"] },
  { name:"du (EITC)",        color:"#E2231A", ats:"careersUrl",  careersUrl:"https://careers.du.ae",                            regions:["gcc"] },
  { name:"Emirates NBD",     color:"#B8A000", ats:"workday",      workdayTenant:"emiratesnbd",   workdaySite:"External",        regions:["gcc"] },
  { name:"FAB",              color:"#B8860B", ats:"workday",      workdayTenant:"fab",           workdaySite:"External",        regions:["gcc"] },
  { name:"Mashreq Bank",     color:"#E6002D", ats:"careersUrl",  careersUrl:"https://careers.mashreqbank.com",                  regions:["gcc"] },
  { name:"DP World",         color:"#006738", ats:"workday",      workdayTenant:"dpworld",       workdaySite:"External",        regions:["gcc"] },
  { name:"Majid Al Futtaim", color:"#00205B", ats:"workday",      workdayTenant:"majidalfuttaim", workdaySite:"External",       regions:["gcc"] },
  { name:"Al-Futtaim",       color:"#C8102E", ats:"workday",      workdayTenant:"alfuttaim",     workdaySite:"External",        regions:["gcc"] },
  { name:"Alshaya Group",    color:"#D4AF37", ats:"careersUrl",  careersUrl:"https://careers.alshaya.com",                      regions:["gcc"] },
  { name:"Landmark Group",   color:"#E41E20", ats:"workday",      workdayTenant:"landmarkgroup", workdaySite:"External",        regions:["gcc"] },
  { name:"Emaar",            color:"#00629B", ats:"careersUrl",  careersUrl:"https://careers.emaar.com",                        regions:["gcc"] },
  { name:"Flydubai",         color:"#D71E28", ats:"workday",      workdayTenant:"flydubai",      workdaySite:"External",        regions:["gcc"] },
  { name:"Air Arabia",       color:"#E8102D", ats:"careersUrl",  careersUrl:"https://www.airarabia.com/en/careers",             regions:["gcc"] },
  { name:"Aramex",           color:"#E81C24", ats:"workday",      workdayTenant:"aramex",        workdaySite:"External",        regions:["gcc"] },
  { name:"DEWA",             color:"#007A3D", ats:"careersUrl",  careersUrl:"https://www.dewa.gov.ae/en/about-dewa/careers",    regions:["gcc"] },
  { name:"RTA Dubai",        color:"#006E51", ats:"careersUrl",  careersUrl:"https://www.rta.ae/wps/portal/rta/ae/careers",    regions:["gcc"] },
  { name:"Dubai Future Fdn", color:"#0075C9", ats:"greenhouse",  boardToken:"dubaifuturefoundation",                            regions:["gcc"] },
  { name:"G42",              color:"#0F2540", ats:"greenhouse",  boardToken:"g42",                                               regions:["gcc"] },
  { name:"Presight AI",      color:"#00A3E0", ats:"greenhouse",  boardToken:"presight",                                         regions:["gcc"] },
  { name:"Chalhoub Group",   color:"#1D3557", ats:"workday",      workdayTenant:"chalhoub",      workdaySite:"External",        regions:["gcc"] },
  { name:"Agility",          color:"#E31937", ats:"workday",      workdayTenant:"agility",       workdaySite:"External",        regions:["gcc"] },

  // ── UAE Tech / Startups ───────────────────────────────────────────────────
  { name:"Careem",           color:"#1DBF73", ats:"greenhouse",  boardToken:"careem",                                            regions:["gcc"] },
  { name:"Property Finder",  color:"#FF5A5F", ats:"lever",       boardToken:"propertyfinder",                                   regions:["gcc"] },
  { name:"Noon",             color:"#FEEE00", ats:"greenhouse",  boardToken:"noon",                                              regions:["gcc"] },
  { name:"Talabat",          color:"#FF6D00", ats:"greenhouse",  boardToken:"talabat",                                           regions:["gcc"] },
  { name:"Kitopi",           color:"#FF4E00", ats:"greenhouse",  boardToken:"kitopi",                                            regions:["gcc"] },
  { name:"Bayut",            color:"#E11B22", ats:"greenhouse",  boardToken:"bayut",                                             regions:["gcc"] },
  { name:"dubizzle",         color:"#FF6600", ats:"greenhouse",  boardToken:"dubizzle",                                          regions:["gcc"] },
  { name:"Yalla",            color:"#7B2D8B", ats:"lever",       boardToken:"yallagroup",                                       regions:["gcc"] },
  { name:"Pure Harvest",     color:"#4CAF50", ats:"greenhouse",  boardToken:"pureharvestsmartfarms",                             regions:["gcc"] },

  // ── Saudi Arabia ──────────────────────────────────────────────────────────
  { name:"Saudi Aramco",   color:"#008000", ats:"careersUrl",  careersUrl:"https://www.aramco.com/en/careers",                  regions:["gcc"] },
  { name:"SABIC",          color:"#005DAA", ats:"workday",      workdayTenant:"sabic",          workdaySite:"External",          regions:["gcc"] },
  { name:"STC",            color:"#6D2077", ats:"careersUrl",  careersUrl:"https://careers.stc.com.sa",                         regions:["gcc"] },
  { name:"NEOM",           color:"#00B0A0", ats:"greenhouse",  boardToken:"neom",                                                regions:["gcc"] },
  { name:"NCB (AlAhli)",   color:"#008755", ats:"careersUrl",  careersUrl:"https://www.alahli.com/en-us/about/careers",         regions:["gcc"] },
  { name:"stc pay",        color:"#6D2077", ats:"greenhouse",  boardToken:"stcpay",                                             regions:["gcc"] },
  { name:"Lean Technologies",color:"#1F3A93",ats:"greenhouse", boardToken:"leantech",                                           regions:["gcc"] },
  { name:"Tamara",         color:"#2DBD7E", ats:"greenhouse",  boardToken:"tamara",                                              regions:["gcc"] },

  // ── GCC Banking & Finance ─────────────────────────────────────────────────
  { name:"QNB",            color:"#8B0000", ats:"careersUrl",  careersUrl:"https://career.qnb.com",                             regions:["gcc"] },
  { name:"Gulf Air",       color:"#8B0000", ats:"careersUrl",  careersUrl:"https://www.gulfair.com/about-us/careers",           regions:["gcc"] },
  { name:"Qatar Airways",  color:"#5C0632", ats:"workday",      workdayTenant:"qatarairways",   workdaySite:"External",          regions:["gcc"] },
  { name:"HSBC ME",        color:"#DB0011", ats:"workday",      workdayTenant:"hsbc",           workdaySite:"External",          regions:["gcc"] },
  { name:"Standard Chartered",color:"#004B8D",ats:"workday",   workdayTenant:"scb",            workdaySite:"External",          regions:["gcc"] },
];
