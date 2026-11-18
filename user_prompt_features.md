<USER_REQUEST>
# KHATRI SARVANIYAT – SPECIFIC FEATURE ENHANCEMENTS
## FRONTEND + BACKEND + SUPABASE DATABASE + RBAC + WORKFLOW IMPLEMENTATION

### STRICT PROJECT INSTRUCTIONS

Implement ONLY the features and changes described in this prompt.

This is an existing KHATRI SARVANIYAT project built with React, TypeScript, Vite, Tailwind CSS and Supabase.

Before making any changes:

1. Inspect the existing project architecture.
2. Inspect the existing frontend components and pages.
3. Inspect Supabase database tables, relationships, migrations, RPC functions, triggers and RLS policies.
4. Inspect the existing authentication and role-permission system.
5. Identify reusable components and existing workflows.
6. Understand how families, persons, family memberships, Mukhis and regional assignments are currently stored.

Do not create duplicate functionality or unnecessary database tables.

Preserve all existing data and functionality.

Do not modify unrelated modules.

Do not redesign the entire website.

Do not push or pull anything to GitHub.

Do not deploy the website.

All changes must be implemented and tested in both frontend and backend wherever applicable.

---

# FEATURE 1: LANDING PAGE – ORGANIZATION NAME AND BRANDING

Refer to the provided landing-page screenshot.

Currently, the hero section displays the logo followed by:

"Preserve Your Family Legacy"

I want to add the official organization name prominently below the logo and above the existing heading.

### Required display order

1. Existing KHATRI SARVANIYAT logo.
2. Official organization name:
   **AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)**
3. Existing heading:
   "Preserve Your Family Legacy"
4. Existing description.
5. Existing action buttons:
   - Start Your Family Census
   - Search Families

### Typography hierarchy

The official organization name must be the most prominent text in the hero section.

- Display it in large, bold, professional typography.
- Make it visually prominent immediately below the logo.
- Allow responsive wrapping on smaller screens.
- Use appropriate letter spacing and line height.
- Ensure the complete organization name remains readable.

The existing "Preserve Your Family Legacy" heading must be smaller than the newly added organization name but still clearly visible.

The description must be smaller than both headings.

Maintain the existing dark navy background, existing branding, logo, layout style and professional appearance.

### Responsive requirements

Desktop:
- Logo at the top.
- Large organization name below the logo.
- Smaller "Preserve Your Family Legacy" heading.
- Description and buttons below.

Mobile:
- Center-align the content.
- Prevent horizontal overflow.
- Wrap the organization name naturally.
- Maintain readable font sizes.
- Keep buttons properly aligned.

Do not replace the existing logo.

Do not change navigation, header links, account controls or unrelated landing-page content.

---

# FEATURE 2: CLAIM AN EXISTING COMPLETE FAMILY

## Objective

Currently, a user can create and manage their own family.

I now want another important feature:

If a family already exists in the KHATRI SARVANIYAT database, a user should be able to request ownership/management access to that entire existing family.

For example:

- Jayesh's family already exists in the Family Directory.
- Another registered user discovers that this is their family.
- The user wants to claim and manage that existing family.
- The user submits a complete family claim request.
- Mukhi, Admin or Super Admin reviews the request.
- After approval, the family becomes accessible under the approved user's My Family section.
- The approved user can manage the family and its members according to the granted permissions.

This must be a complete backend-controlled workflow, not just a frontend button.

## A. Add Claim Family option

Add a clearly visible "Claim This Family" action wherever appropriate in:

- Family Directory.
- Family Search results.
- Existing Family Record page.
- Family details view.

The action must be available to authenticated users who are eligible to submit a claim.

If a user is not logged in, ask them to log in before submitting the claim.

Do not display the action when:
- The user already has approved management access.
- The user already has a pending claim for the same family.
- The family is unavailable for claiming according to the existing business rules.

## B. Claim Family Request Form

When the user clicks "Claim This Family", open a professional request form.

Include:

1. Family name.
2. Family ID, read-only.
3. Existing Family Head.
4. User's name.
5. User's registered email.
6. User's relationship with the family.
7. Reason for claiming the family.
8. Supporting information or documents, if supported by the existing application.

Allow the user to provide additional information explaining why they should be authorized to manage this family.

The request must clearly state:

"By submitting this request, you are asking for permission to manage this existing family record. The family will not be transferred or modified until an authorized reviewer approves your request."

Validate all required fields.

Prevent duplicate pending requests.

## C. Backend request creation

Create or extend the existing family-claim request structure.

Inspect whether a family-claim table already exists.

If it exists, reuse and extend it.

If it does not exist, create a suitable table through a safe Supabase migration.

The claim request should store information equivalent to:

- id
- family_id
- requested_by_user_id
- requested_by_person_id, if applicable
- requested_relationship
- reason
- supporting_document_reference, if applicable
- status
- reviewed_by
- reviewed_by_role
- reviewer_comments
- created_at
- reviewed_at
- updated_at

Allowed statuses:

- PENDING
- APPROVED
- REJECTED
- CANCELLED

Use foreign keys to the existing user, person and family records.

Do not duplicate family or person records when a claim is submitted.

## D. Approval workflow

The claim request must be reviewable by:

- Mukhi.
- Admin.
- Super Admin.

However, a Mukhi must only be able to review claims within their authorized regional jurisdiction.

Admin and Super Admin may review claims according to their existing global permissions.

Approval interface must display:

- Family details.
- Existing Family Head.
- Family members.
- Requester's registered profile.
- Requester's relationship with the family.
- Claim reason.
- Supporting information.
- Submission date.
- Current request status.

Provide actions:

- Approve Request.
- Reject Request.
- View Family.
- View Requester.

Require confirmation before approval or rejection.

Allow reviewers to provide a review comment or reason for rejection.

## E. Approval behaviour

When a claim is approved:

1. Validate that the reviewer has permission.
2. Validate the request is still PENDING.
3. Confirm the requested family still exists.
4. Verify the requester and relevant person records.
5. Check whether another user already has conflicting management ownership.
6. Apply the approved family-management permission according to the defined ownership policy.
7. Record the reviewer and approval timestamp.
8. Update the request status to APPROVED.
9. Make the family available in the requester's My Family section.
10. Refresh all relevant family and user queries.

The approved user must be able to:

- Open the complete family record.
- View the Family Roster.
- View the Family Tree.
- Edit permitted family details.
- Edit permitted member details.
- Correct family relationships.
- Add eligible new family members.
- Manage family information within the existing authorization rules.

IMPORTANT:

Do not create a second copy of the family.

Do not duplicate person records.

Do not break existing family relationships.

Do not automatically change the Family Head just because a claim is approved.

The claimant's management access and the Family Head designation must remain separate concepts.

### Multiple ownership and family protection

A family may already have a legitimate manager or Family Head.

Do not silently remove the existing manager or Family Head.

Inspect the current ownership and family membership model.

Implement an explicit management-access policy.

If a family already has an active manager, the claim must require an appropriate authorization or transfer process rather than silently replacing the existing manager.

If the existing data does not support safe transfer, keep the claim pending until an authorized reviewer resolves the conflict.

Preserve an audit trail of ownership and management changes.

## F. Rejection behaviour

When rejected:

- Mark the request REJECTED.
- Save reviewer ID.
- Save review timestamp.
- Save rejection reason.
- Do not modify family ownership or permissions.
- Notify the requester through the existing notification system, if available.
- Allow a new request only according to the existing claim rules.

## G. My Family integration

After approval:

- Show the claimed family in My Family.
- Display a "Claimed Family" or appropriate management-access indicator.
- Allow the approved user to open the family record.
- Allow editing based on the approved permissions.
- Ensure the family is not duplicated in the Family Directory or Census.

For pending requests, show:

"Family Claim Pending Approval"

For rejected requests, show:

"Family Claim Rejected" with the review reason where permitted.

For approved requests, show:

"Family Management Access Approved"

## H. Family claim security

Enforce claim permissions through backend validation and Supabase RLS.

Do not trust frontend status values.

Only an authorized reviewer may approve or reject a request.

A user must not be able to approve their own claim unless the existing governance rules explicitly permit it.

Use database transactions or an equivalent atomic backend operation for approval.

Prevent two reviewers from approving conflicting requests simultaneously.

---

# FEATURE 3: ADMIN AND SUPER ADMIN – COMPLETE DATA EXPORT SYSTEM

## Objective

I want Admin and Super Admin to download the information stored in KHATRI SARVANIYAT.

Add a dedicated section in both:

- Admin Panel.
- Super Admin Panel.

Section name:

**Data Export & Reports**

This must allow authorized administrators to export data in:

1. Excel (.xlsx).
2. PDF (.pdf).

Do not expose private information to unauthorized users.

## A. Exportable data

Inspect the actual database and allow authorized exports of relevant records, including:

### People / Census
- Person ID.
- Full name.
- Gender.
- Date of birth.
- Age, if available or safely calculated.
- Birthplace.
- Blood group.
- Profession.
- Contact details, where authorized.
- Email, where authorized.
- Gotra.
- Nukh.
- Family ID.
- Family name.
- City.
- State / Province.
- Country.
- Relevant profile status.

### Family Records
- Family ID.
- Family name.
- Family Head.
- Family members.
- Family location.
- Gotra.
- Nukh.
- Family status.
- Family creation date.

### Mukhi Records
- Mukhi ID.
- Linked person.
- Name.
- Profession.
- Email, where authorized.
- Contact information, where authorized.
- Assigned region.
- Assigned city.
- Active / Inactive status.

### Additional modules

Where appropriate and authorized, provide exports for:
- Committees.
- Committee members.
- Claim requests.
- Family membership records.
- Relationship records.
- Other relevant administrative records.

Do not combine unrelated records into one poorly structured spreadsheet.

Use separate sheets for different data categories where appropriate.

## B. Export filters

Create a professional filter interface.

Allow administrators to filter records using:

### Geographic filters
- Country.
- State / Province.
- City.
- District, if stored.
- Village or location, if stored.

### Mukhi filters
- All Mukhis.
- Specific Mukhi.
- Mukhi ID.
- Mukhi's assigned region.
- Mukhi's assigned city.
- People belonging to a particular Mukhi's jurisdiction.

### Community filters
- Gotra.
- Nukh.
- Profession.
- Gender.
- Family.
- Family Head.
- Active / Inactive status, where applicable.

### Other filters
- Registration date range.
- Profile verification status.
- Deceased / living status, where applicable.
- Claim status.

Filters should be combinable.

Example:

Country: India
State: Gujarat
City: Ahmedabad
Mukhi: Selected Mukhi
Profession: Business

The export should include only records matching all selected filters.

## C. Mukhi-region mapping

This is especially important.

If a Mukhi is assigned to a particular region, the export must correctly identify people belonging to that jurisdiction using the existing official region assignment logic.

Do not simply filter by matching city text if the database has a proper Mukhi-region mapping.

Use the actual database relationships between:

- Mukhi.
- Assigned region.
- City or location.
- Person.
- Family.

If a person belongs to a region without a direct Mukhi assignment, do not incorrectly assign them to another Mukhi.

Handle unassigned records separately.

## D. Export preview

Before downloading, show:

- Selected data type.
- Selected filters.
- Number of matching records.
- Selected output format.

Provide:

- Export to Excel.
- Export to PDF.

Allow the administrator to cancel or change filters before generating the file.

## E. Excel export

Generate professional Excel files.

Requirements:

- Clear column headings.
- One record per row.
- Correct data types.
- Readable column widths.
- Appropriate sheet names.
- Header formatting.
- Date formatting.
- Filterable column headers.
- No merged cells that break data processing.

For combined exports, use separate worksheets such as:

1. People.
2. Families.
3. Family Members.
4. Relationships.
5. Mukhis.
6. Committees.

Include only the worksheets requested by the user.

## F. PDF export

Generate properly formatted PDFs.

Requirements:

- KHATRI SARVANIYAT branding.
- Report title.
- Export date.
- Selected filters.
- Total records.
- Readable column headings.
- Page numbers.
- Proper page breaks.
- Repeated table headers.
- Appropriate portrait or landscape orientation.
- Consistent fonts.
- Rupee symbol support if monetary fields are ever included.

Do not generate screenshot-style PDFs.

PDFs must contain selectable text and properly structured tables.

## G. Export security

Only Admin and Super Admin can use the global data export feature.

Enforce this in backend functions and database policies.

Never expose service-role keys or unrestricted database credentials in frontend code.

Use secure backend export operations or permission-checked data queries.

Validate all filters on the server.

Prevent unauthorized users from downloading bulk community information.

Record export audit information:

- User ID.
- User role.
- Export type.
- Filters used.
- Number of records.
- File format.
- Date and time.

Do not store exported files publicly unless the existing storage and security architecture explicitly supports secure private downloads.

---

# FEATURE 4: MANDATORY PROFESSION FIELD FOR EVERY PERSON

## Objective

Whenever a person is added or created anywhere in KHATRI SARVANIYAT, their profession must be collected as a mandatory field.

This applies to:

- Normal user profile creation, where person information is collected.
- Add Family Member.
- Edit Member.
- Family creation, where the Family Head person record is created.
- Admin person creation.
- Super Admin person creation.
- Mukhi person creation.
- Mukhi management.
- Census person creation.
- Profile claim or verification, where missing person details are collected.
- Bulk import workflows.
- Any other workflow that creates a new person record.

Do not implement profession only in the normal Add Member form.

Search the entire codebase for every person-creation workflow.

## A. Profession master list

Create or reuse a centralized profession master.

Inspect whether a profession table already exists.

If it exists, extend it.

If it does not exist, create a suitable table.

Recommended fields:

- id
- profession_code
- profession_name
- profession_category
- description
- is_active
- display_order
- created_at
- updated_at

Create a practical initial profession catalogue, including categories such as:

### Education
- Teacher.
- Professor.
- Lecturer.
- Principal.
- Researcher.
- Education Consultant.

### Engineering and Technology
- Software Engineer.
- Computer Engineer.
- Civil Engineer.
- Mechanical Engineer.
- Electrical Engineer.
- IT Professional.
- Data Analyst.
- Developer.
- Technical Consultant.

### Healthcare
- Doctor.
- Dentist.
- Nurse.
- Pharmacist.
- Medical Practitioner.
- Healthcare Professional.

### Business and Commerce
- Business Owner.
- Entrepreneur.
- Trader.
- Shopkeeper.
- Industrialist.
- Wholesaler.
- Retailer.
- Importer / Exporter.

### Government and Public Service
- Government Employee.
- Government Officer.
- Police Officer.
- Defence Personnel.
- Public Servant.

### Finance and Legal
- Chartered Accountant.
- Accountant.
- Auditor.
- Lawyer.
- Advocate.
- Financial Consultant.
- Banker.

### Agriculture
- Farmer.
- Agricultural Entrepreneur.
- Agricultural Consultant.
- Dairy Business Owner.

### Creative and Media
- Artist.
- Designer.
- Photographer.
- Journalist.
- Writer.
- Content Creator.

### Other
- Homemaker.
- Student.
- Retired.
- Self-employed.
- Unemployed.
- Other.

This is an initial catalogue. Allow Admin and Super Admin to maintain the profession master where appropriate.

Do not restrict users to an unnecessarily small fixed list.

## B. Profession selector

Every person-creation form must include:

**Profession * (Required)**

Use a searchable dropdown.

Features:

- Search profession.
- Group by category.
- Select one primary profession.
- Select Other.
- Provide a custom profession name when Other is selected.
- Display the selected profession while editing.
- Validate before submission.

If the project needs to support multiple professions for a person, inspect the current data model and implement that only if it can be done without breaking existing functionality. Otherwise, keep one primary profession and allow a separate custom description.

## C. Database implementation

Store the selected profession using a stable profession ID or code linked to the central profession master.

Do not store inconsistent free-text values across different modules.

If custom professions are allowed, store the custom name safely and preserve the standardized category where available.

Add the required foreign keys and indexes.

## D. Existing people without profession

Do not fabricate profession information for existing people.

Do not assign random professions.

Preserve all existing person records.

Identify existing records with missing professions.

Mark them as:

"Profession Pending"

Provide a safe workflow for authorized users to update missing profession information.

New person creation must require a valid profession.

If existing database constraints prevent a safe migration, document and resolve the migration in stages without blocking unrelated existing records.

## E. Edit Member

When editing a person:

- Load their current profession.
- Allow authorized users to update it.
- Save the new profession correctly.
- Refresh all relevant profile and directory views.

---

# FEATURE 5: PROFESSION-WISE PEOPLE DIRECTORY IN ADMIN, SUPER ADMIN AND MUKHI PANELS

## Objective

Add a dedicated section where authorized authorities can view people based on their profession.

Create a new panel section named:

**Profession Directory**

Add it to:

- Admin Panel.
- Super Admin Panel.
- Mukhi Panel.

## A. Directory interface

The page must contain:

1. Search bar.
2. Profession filter.
3. Profession category filter.
4. Country filter.
5. State / Province filter.
6. City filter.
7. Mukhi filter, where applicable.
8. Family filter.
9. Clear Filters button.
10. Results count.

Display results in a professional searchable table.

Suggested columns:

- Person Name.
- Profession.
- Profession Category.
- Family Name.
- City.
- State.
- Country.
- Mukhi / Assigned Region, if applicable.
- Profile Status.

Allow authorized users to open a person's permitted profile details.

## B. Search functionality

Search by:

- Person name.
- Profession.
- Custom profession.
- City.
- Family name.

Support combined filters.

Example:

Profession: Doctor
State: Gujarat
City: Ahmedabad

The directory should return only matching records.

## C. Mukhi-specific access

A Mukhi must only see people within their authorized region or jurisdiction.

For example:

If Mukhi A is assigned to Region A, their Profession Directory must show people in Region A only.

They must not be able to change frontend filters or API parameters to access another Mukhi's region.

Enforce this restriction through backend validation and RLS.

## D. Admin and Super Admin access

Admin and Super Admin can view the global Profession Directory according to their existing permissions.

They can filter across all authorized regions.

Do not grant Mukhi global access.

## E. Performance

Use server-side pagination and filtering.

Do not load the entire census database into the browser.

Use indexes for commonly searched profession, location and person fields.

Use the existing TanStack Query architecture.

---

# FEATURE 6: MUKHI DETAILS ACCESS FROM FAMILY RECORD

## Objective

Whenever any authenticated website user visits a Family Record, they should be able to see the Mukhi assigned to that family or its region.

Refer to the provided Family Record screenshot.

Currently, the family record displays a Selected Mukhi card.

I want that card to be interactive.

## A. Clickable Mukhi card

Make the Mukhi card clickable.

When a user clicks:

- Mukhi name.
- Mukhi profile image or avatar.
- Mukhi ID.
- Mukhi card area.

Open the corresponding Mukhi details view.

The entire card should have a clear hover state and pointer cursor.

## B. Mukhi details page or modal

Display available and authorized information:

- Mukhi name.
- Mukhi ID.
- Profile photo.
- Profession.
- Assigned region.
- Assigned city.
- Contact number, where public and authorized.
- Official designation.
- Mukhi status.

Do not expose private email, phone or other personal information unless the existing privacy rules permit it.

## C. Access

All authenticated users who can access the Family Record may open the permitted Mukhi details.

This includes:

- Normal users.
- Family Heads.
- Mukhis.
- Admin.
- Super Admin.

However, display only fields that each user is authorized to see.

## D. Correct Mukhi resolution

Fetch the Mukhi using the actual family-region or explicit family-Mukhi assignment.

Do not use a hardcoded Mukhi.

Do not select an arbitrary Mukhi from the directory.

If no Mukhi is assigned, show:

"No Mukhi assigned to this family or region."

If the Mukhi is inactive, do not display them as an active Mukhi.

Do not remove the person's profile when their Mukhi authority becomes inactive.

---

# FEATURE 7: REMOVE / DEACTIVATE MUKHI FROM DIRECTORY

## Objective

Add a safe Mukhi removal or deactivation feature to the Admin Panel and Super Admin Panel.

When Admin or Super Admin removes a Mukhi from the Mukhi Directory:

- Their Mukhi authority must be deactivated.
- They must become a normal community user, subject to their other independent roles.
- Their website account must remain active.
- Their personal profile must remain.
- Their census person record must remain.
- Their family membership must remain.
- Their family relationships must remain.
- Their historical Mukhi record must remain available for audit.

This must not be implemented as permanent deletion of the person or login account.

## A. Mukhi management interface

In Mukhi Directory management, provide an action:

"Deactivate Mukhi"

Display a confirmation dialog containing:

- Mukhi name.
- Mukhi ID.
- Assigned region.
- Current status.
- Explanation of the action.

Confirmation text:

"Deactivating this Mukhi will remove their Mukhi authority and Mukhi Directory listing. Their normal website account, personal profile, family records and census information will remain unchanged."

Provide:

- Cancel.
- Confirm Deactivation.

## B. Backend deactivation

Inspect the existing Mukhi database architecture.

Identify the correct authority/status record.

When deactivation is confirmed:

1. Validate Admin or Super Admin permission.
2. Confirm the Mukhi record exists.
3. Confirm the current status is active.
4. Deactivate the Mukhi authority.
5. Preserve the Mukhi ID and historical record.
6. Remove effective Mukhi-only permissions.
7. Preserve independent Admin or Super Admin permissions if the person has them.
8. Keep the person's MEMBER access.
9. Preserve the user account.
10. Preserve the person and family records.
11. Record the action in the audit log.
12. Recalculate active Mukhi counts.
13. Update all affected frontend views.

Use an atomic database transaction or secure RPC operation.

Do not delete the underlying person or profile.

## C. Prevent automatic reactivation

This is mandatory.

If the user has an email matching an old Mukhi record, email matching must not automatically reactivate Mukhi authority after deactivation.

An explicitly inactive Mukhi authority record must take precedence over an email match.

Reactivation must require a new authorized Admin or Super Admin action.

## D. Mukhi count synchronization

After deactivation:

- Mukhi Directory count must decrease correctly.
- Community Hub count must update.
- Dashboard count must update.
- Search results must exclude inactive Mukhis by default.
- Active Mukhi lists must refresh immediately.
- No full-page reload should be required.

Use the actual active Mukhi database query as the source of truth.

Do not simply decrement a frontend number.

Prevent double counting and repeated decrements.

## E. Historical records

Preserve:

- Mukhi ID.
- Person ID.
- Previous region assignment.
- Activation date.
- Deactivation date.
- Deactivated by.
- Reason for deactivation, if provided.

Keep historical Mukhi information available to authorized administrators.

Do not display inactive Mukhis as active Mukhi representatives in family records.

## F. Reactivation

Allow Admin and Super Admin to reactivate a previously deactivated Mukhi where permitted.

When reactivated:

- Restore the same Mukhi record and ID.
- Restore authorized Mukhi permissions.
- Verify region assignment.
- Record the reactivation action.
- Recalculate active Mukhi count.
- Refresh the directory and related screens.

Do not create a duplicate Mukhi record.

---

# FEATURE 8: CENTRALIZED FRONTEND AND BACKEND SYNCHRONIZATION

Every new feature must follow the existing application architecture.

Use the existing:

- React components.
- TypeScript types.
- Supabase client.
- Service functions.
- TanStack Query.
- Form validation.
- Zod schemas.
- Role and permission utilities.
- Toast and error handling.
- Reusable UI components.

Do not create independent or duplicate implementations for the same operation.

For every mutation:

1. Validate the user's permissions.
2. Validate the submitted data.
3. Execute the backend operation.
4. Confirm the database operation succeeded.
5. Invalidate or update the appropriate query cache.
6. Refresh the relevant interface.
7. Display an accurate success or error message.

Do not show false success messages.

Use server-side validation and database constraints.

---

# FEATURE 9: DATABASE MIGRATION REQUIREMENTS

Inspect the existing Supabase schema before creating migrations.

Reuse existing tables whenever possible.

Potential changes may involve:

- Family claim request records.
- Family management permissions or ownership records.
- Profession master.
- Person profession reference.
- Mukhi authority status.
- Mukhi audit records.
- Export audit records.
- Region mapping.
- Required indexes and foreign keys.

These are possible schema areas, not instructions to create every table blindly.

Create only what is genuinely required after inspecting the existing schema.

Migration requirements:

- Safe and reversible where possible.
- No database reset.
- No deletion of existing families.
- No deletion of persons.
- No deletion of user accounts.
- No deletion of existing Mukhi records.
- No breaking changes to family relationships.
- No changes to unrelated database tables.
- No removal of existing RLS security.

Handle existing records without profession carefully.

Do not fabricate data.

Use appropriate foreign keys, unique constraints, indexes and transactions.

Update database types and application types after schema changes.

---

# FEATURE 10: ROLE AND PERMISSION MATRIX

Implement these permissions using the actual existing RBAC model.

| Feature | Normal User | Mukhi | Admin | Super Admin |
|---|---|---|---|---|
| Submit family claim | Yes, if eligible | Yes, if eligible | Yes, if eligible | Yes, if eligible |
| Review family claims | No | Assigned region only | Authorized global access | Authorized global access |
| Manage approved family | Approved permissions only | Approved permissions only | Existing permissions | Existing permissions |
| View profession directory | No new global access | Own region only | Global | Global |
| Export global people data | No | No | Yes | Yes |
| Export filtered regional data | No | No, unless separately authorized | Yes | Yes |
| Deactivate Mukhi | No | No | Yes | Yes |
| Reactivate Mukhi | No | No | Yes | Yes |
| View permitted Mukhi details | Yes | Yes | Yes | Yes |
| Manage profession master | No | No | As authorized | Yes |

IMPORTANT:

This matrix describes the intended behaviour for these new features.

Preserve existing permissions for all other modules.

Do not grant broader permissions than necessary.

Enforce the matrix in backend functions and RLS, not only frontend navigation.

---

# FEATURE 11: UI/UX REQUIREMENTS

Follow the existing KHATRI SARVANIYAT design system.

Maintain:

- Dark navy header.
- Existing logo.
- Existing typography.
- Existing button styles.
- Existing card design.
- Existing spacing.
- Existing responsive layout.
- Existing theme.

New pages must look like part of the current website.

Create the following interfaces:

1. Landing page organization title.
2. Claim Family button.
3. Claim Family form.
4. Family claim status.
5. Admin claim review panel.
6. Data Export & Reports.
7. Export filters and preview.
8. Profession selector.
9. Profession Directory.
10. Clickable Mukhi details card.
11. Mukhi details page or modal.
12. Mukhi deactivation confirmation.
13. Inactive Mukhi history and reactivation controls.

Use appropriate loading, empty, success and error states.

Ensure desktop, tablet and mobile responsiveness.

---

# FEATURE 12: COMPLETE TESTING REQUIREMENTS

Do not finish implementation without testing.

## A. Landing page

- Official organization name appears below the logo.
- Organization name is larger than "Preserve Your Family Legacy".
- Existing heading, description and buttons remain.
- Mobile layout works.

## B. Claim family

Test:

- User can submit a valid claim.
- Duplicate pending requests are prevented.
- Request appears in the review panel.
- Mukhi can review only their region.
- Admin and Super Admin can review according to permissions.
- Approval grants correct family-management access.
- Approved family appears in My Family.
- No duplicate family is created.
- Existing Family Head remains unchanged unless separately authorized.
- Rejection preserves the existing family.
- Conflicting ownership requests are handled safely.
- RLS blocks unauthorized approval.

## C. Export system

Test:

- Excel export.
- PDF export.
- Correct column values.
- Correct record count.
- Region filters.
- Mukhi filters.
- Profession filters.
- Combined filters.
- Date filters.
- Empty result handling.
- Large dataset handling.
- Permission restrictions.
- Export audit records.

## D. Profession

Test every person-creation flow.

- Add Member requires profession.
- Edit Member loads existing profession.
- Admin creation requires profession.
- Super Admin creation requires profession.
- Mukhi creation requires profession.
- Census creation requires profession.
- Other profession works.
- Missing existing profession is handled safely.
- Database rejects invalid profession references.

## E. Profession Directory

- Search by person name.
- Search by profession.
- Search by city.
- Filter by category.
- Filter by region.
- Mukhi only sees their region.
- Admin and Super Admin see authorized global results.
- Pagination works.
- No unauthorized records are exposed.

## F. Mukhi profile

- Mukhi card opens correct profile.
- Correct Mukhi is resolved from the family.
- Inactive Mukhi is not shown as active.
- Privacy permissions are respected.
- Missing Mukhi assignment is handled correctly.

## G. Mukhi deactivation

Test:

- Active Mukhi can be deactivated.
- Mukhi authority is removed.
- Login account remains active.
- Profile remains.
- Family records remain.
- Person remains in census.
- Mukhi count updates immediately.
- Directory excludes inactive Mukhi.
- Email matching does not reactivate the authority.
- Independent Admin/Super Admin roles are preserved.
- Reactivation works without duplicate records.

---

# FEATURE 13: STRICT SCOPE CONTROL

Only implement the following requested changes:

1. Add official organization name to landing page.
2. Add complete existing-family claim workflow.
3. Add approval by Mukhi, Admin and Super Admin with proper jurisdiction.
4. Add approved family to claimant's My Family.
5. Allow authorized editing of claimed family members.
6. Add Admin and Super Admin data export to Excel and PDF.
7. Add geographic, Mukhi, profession and other relevant export filters.
8. Make profession mandatory for all new person-creation workflows.
9. Add centralized profession master.
10. Add Profession Directory to Admin, Super Admin and Mukhi panels.
11. Restrict Mukhi Profession Directory to their assigned region.
12. Make the Mukhi card on Family Record clickable.
13. Display authorized Mukhi profile details.
14. Add safe Mukhi deactivation/removal from directory.
15. Downgrade deactivated Mukhi authority to normal user access while preserving their account and personal records.
16. Ensure correct database updates, counts, RLS and frontend synchronization.

Do not modify:

- Existing authentication design.
- Existing family relationship logic.
- Existing Family Tree structure.
- Existing family creation workflow beyond necessary profession validation.
- Existing committee workflow.
- Existing event workflow.
- Existing circular workflow.
- Existing Gotra/Nukh logic.
- Existing role hierarchy.
- Existing unrelated UI components.
- Existing data.
- Existing deployment settings.

Only make minimal changes to existing modules where required to integrate these features.

---

# FEATURE 14: FINAL IMPLEMENTATION REPORT

After completing the work, provide a detailed report.

Include:

1. Frontend files modified.
2. Backend files modified.
3. Database tables modified.
4. New tables created, if any.
5. Supabase migrations created.
6. RLS policies modified.
7. RPC functions or triggers modified.
8. Claim family workflow implemented.
9. Export formats implemented.
10. Export filters implemented.
11. Profession master and mandatory validation implemented.
12. Profession Directory implemented.
13. Mukhi profile access implemented.
14. Mukhi deactivation and reactivation implemented.
15. Testing performed.
16. Bugs found and fixed.
17. Remaining issues.

Do not claim a feature is complete if only its UI has been created.

Verify actual database persistence, backend authorization, query synchronization and end-to-end workflows.

FINAL ACCEPTANCE:

All requested features must work from the frontend through the backend and Supabase database.

No existing family, person, profile, relationship, login account or Mukhi history may be accidentally deleted.

The website must remain stable, secure and responsive.

Do not push or pull to GitHub.

Do not deploy.

Implement only the requested changes.# IMPORTANT UPDATE – OFFICIAL OCCUPATION PDF (MANDATORY)

**Reference file: `30_Main_Occupation_Categories(2).pdf`**

Use the attached PDF as the ONLY authoritative source for the occupation/profession categories throughout KHATRI SARVANIYAT.

Do not use the previously suggested occupation examples or create additional subcategories.

## 1. Exact 30 Occupation Categories

Import and use these 30 categories exactly as written in the PDF:

1. Agriculture
2. Healthcare
3. Education
4. Engineering
5. Information Technology
6. Science and Research
7. Business and Entrepreneurship
8. Finance and Banking
9. Law and Legal Services
10. Government Services
11. Defence and Military
12. Police and Security
13. Construction and Real Estate
14. Manufacturing and Industry
15. Skilled Trades and Repair
16. Transport and Logistics
17. Retail and Trade
18. Hospitality and Tourism
19. Food and Catering
20. Media and Journalism
21. Arts and Entertainment
22. Design and Fashion
23. Beauty and Personal Care
24. Sports and Fitness
25. Social Work and NGOs
26. Energy and Utilities
27. Telecommunications
28. Domestic and Household Services
29. Religious and Cultural Services
30. Digital and Online Services

## 2. Strict Occupation Selection Rules

- Include exactly these 30 main categories.
- Do not create sub-jobs under any category.
- Do not add specific job titles, specializations or examples.
- Do not rename, merge or split the categories.
- Preserve the exact spelling and wording from the PDF.
- Display the categories in the same order as the PDF.
- Use a searchable dropdown containing all 30 categories.
- Allow the user to select one primary occupation category.
- Make occupation selection mandatory whenever a new person record is created.
- Show the selected category when viewing or editing a person's profile.
- Allow authorized users to update the selected category.

If the existing application has a custom occupation field, inspect it before changing anything. Preserve existing information safely and do not silently discard previously stored data.

## 3. Frontend Implementation

Use the same centralized 30-category list in every relevant workflow:

- Registration/profile creation, wherever person details are collected.
- Family creation and Family Head details.
- Add Family Member.
- Edit Member.
- Admin Panel person creation.
- Super Admin Panel person creation.
- Mukhi creation and management.
- Census person creation.
- Profile claim and verification workflows.
- Bulk import workflows.
- Any other person-creation workflow.

Field label: **Occupation / Profession \***

Use a searchable dropdown with exactly the 30 PDF categories.

Do not allow arbitrary additional categories through the normal user-facing selector.

## 4. Backend and Supabase Database

Create or reuse a centralized occupation master table.

Store the 30 categories as standardized records with stable IDs or codes.

Recommended fields:

- id
- occupation_code
- occupation_name
- is_active
- display_order
- created_at
- updated_at

Create exactly 30 initial records from the PDF.

Link each person's occupation to the corresponding master record using a foreign key or the existing equivalent structure.

Enforce mandatory occupation selection for new person records through backend validation.

Do not assign random occupations to existing people whose occupation is missing. Mark those records as "Occupation Pending" until an authorized person updates them.

Use safe migrations. Preserve all existing person records and occupation information.

## 5. Profession Directory – Admin, Super Admin and Mukhi

The Profession Directory must use the same 30 categories from the PDF.

Provide:

- Search by person name.
- Search/filter by occupation category.
- Country filter.
- State/Province filter.
- City filter.
- Family filter.
- Mukhi/region filter, where authorized.
- Clear Filters.
- Results count.

Display the selected occupation category in the directory.

Do not create additional occupation categories or sub-job filters.

Mukhi users must only see people within their assigned jurisdiction. Admin and Super Admin retain their authorized global access.

## 6. Data Export Integration

Use the same 30 official occupation categories in:

- Excel exports.
- PDF reports.
- Data Export & Reports filters.
- Profession Directory reports.
- Regional and Mukhi-wise reports.

The exported occupation value must match the official category stored in the database.

## 7. Strict Validation

Before completing implementation, verify:

1. Exactly 30 occupation categories exist in the master list.
2. Every category matches the attached PDF.
3. No sub-jobs or additional categories have been introduced.
4. Every person-creation workflow requires occupation selection.
5. Edit forms correctly load and update occupation.
6. Profession Directory uses the same centralized category list.
7. Excel and PDF exports show the correct occupation.
8. Database records remain consistent.
9. Existing people without occupation are preserved and marked as pending.

**FINAL INSTRUCTION:** The attached `30_Main_Occupation_Categories(2).pdf` is the final and exclusive reference for occupations. Do not use any other occupation catalogue or invent additional categories. Apply this update only to the occupation-related portions of the original prompt. Keep all other requested features, workflows, permissions, database requirements, UI requirements and strict project instructions unchanged.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-10T23:11:29+05:30.
</ADDITIONAL_METADATA>