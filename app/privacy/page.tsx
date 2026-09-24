import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import LegalPage, { LegalList, LegalSection } from "@/components/LegalPage";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "Privacy Policy",
    description:
        "What personal information Jigzack Cleaning Services collects, why we collect it, who we share it with and how you can ask us to correct or delete it.",
    path: "/privacy",
});

export default function PrivacyPage() {
    return (
        <>
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Privacy Policy", path: "/privacy" },
                ])}
            />

            <LegalPage
                title="Privacy Policy"
                updated="23 September 2026"
                intro="This page explains what personal information Jigzack Cleaning Services collects when you use our website and customer accounts, what we do with it, and the choices you have. We write it to follow the Nigeria Data Protection Act 2023."
            >
                <LegalSection heading="Who we are">
                    <p>
                        Jigzack Cleaning Services is a LAWMA-approved waste collection company serving homes and
                        businesses in Lagos and Port Harcourt. We decide how the information described here is used, so
                        we are the data controller. You can reach us at{" "}
                        <a className="text-amber-300 underline underline-offset-2" href="mailto:info@jigzack.com">
                            info@jigzack.com
                        </a>{" "}
                        or on 0703 433 9721.
                    </p>
                </LegalSection>

                <LegalSection heading="What we collect">
                    <p>What we hold depends on how you use the service.</p>
                    <LegalList
                        items={[
                            <>
                                <strong className="text-white">Your account:</strong> your name, email address and
                                password. Your password is stored in a protected form and we cannot read it.
                            </>,
                            <>
                                <strong className="text-white">Your property and pickups:</strong> your phone and
                                WhatsApp numbers, address, area and state, a nearby landmark, the type and number of
                                units, how often you want pickups, the kind of waste, and any notes you give us.
                            </>,
                            <>
                                <strong className="text-white">Billing:</strong> your invoices, payments, receipts and the
                                reference for your registration fee. Card and bank details are entered on Paystack&apos;s
                                page and never reach us.
                            </>,
                            <>
                                <strong className="text-white">Service records:</strong> your pickup schedule and the
                                before and after photos our crew take at your property to show the work was done.
                            </>,
                            <>
                                <strong className="text-white">Messages:</strong> anything you send through your
                                dashboard or the contact form, including your name, email and phone number. Messages
                                between customers and our staff sent through the platform can be read by our administrators.
                            </>,
                            <>
                                <strong className="text-white">Staff:</strong> for our employees, their name, email,
                                assigned tasks and the photos they upload.
                            </>,
                        ]}
                    />
                </LegalSection>

                <LegalSection heading="Why we use it">
                    <LegalList
                        items={[
                            "To create your account, review it and approve it.",
                            "To schedule and carry out pickups, and to keep a record of each one.",
                            "To send invoices and receipts, and to record payments.",
                            "To email you about your account, such as confirming your address, approval decisions and password resets.",
                            "To answer your messages and enquiries.",
                            "To keep our records, meet legal obligations and prevent fraud or misuse.",
                            "To understand which pages of the website are useful, but only if you accept analytics cookies.",
                        ]}
                    />
                    <p>
                        We rely on the following legal grounds: performing our agreement with you, meeting our legal
                        obligations, our legitimate interest in running and protecting the business, and your consent for
                        analytics cookies.
                    </p>
                </LegalSection>

                <LegalSection heading="Who we share it with">
                    <p>We do not sell your personal information. We use a small number of providers to run the service:</p>
                    <LegalList
                        items={[
                            "Supabase, which hosts our database, sign-in and photo storage.",
                            "Railway, which hosts the website.",
                            "Resend, which sends our emails.",
                            "Paystack, which processes payments.",
                            "Google Analytics, only if you accept analytics cookies.",
                        ]}
                    />
                    <p>
                        These providers may process data on servers outside Nigeria. We may also share information with a
                        regulator or authority when the law requires it.
                    </p>
                </LegalSection>

                <LegalSection heading="Photos">
                    <p>
                        Before and after photos are shown in your dashboard and to our administrators and the crew member
                        assigned to the job. The picture files are stored at addresses that are not listed anywhere
                        public, but anyone who has the exact link to a photo could open it, so please tell us if a photo
                        shows something you would rather we retake or remove.
                    </p>
                </LegalSection>

                <LegalSection id="cookies" heading="Cookies">
                    <p>
                        We use essential cookies to keep you signed in. These are needed for the dashboards to work and do
                        not need your consent.
                    </p>
                    <p>
                        Analytics cookies are optional. We ask the first time you visit, nothing analytics related loads
                        until you accept, and your answer is stored in your browser. You can change your mind at any time
                        with the &quot;Cookie settings&quot; link at the bottom of any public page.
                    </p>
                </LegalSection>

                <LegalSection heading="How long we keep it">
                    <p>
                        We keep your information while your account is active and for as long as we need it for billing,
                        accounting and legal records. After that we delete it or remove anything that identifies you.
                    </p>
                </LegalSection>

                <LegalSection heading="How we protect it">
                    <p>
                        The site runs over HTTPS. Each account can only see its own records, and administrator and staff
                        access is limited by role. No system is perfectly secure, and if something goes wrong that affects
                        you we will tell you and the regulator as the law requires.
                    </p>
                </LegalSection>

                <LegalSection heading="Your rights">
                    <p>You can ask us to:</p>
                    <LegalList
                        items={[
                            "show you the information we hold about you,",
                            "correct anything that is wrong,",
                            "delete your information, where we are not required to keep it,",
                            "limit or stop certain uses of it,",
                            "give you a copy you can take elsewhere.",
                        ]}
                    />
                    <p>
                        You can withdraw consent for analytics at any time. To use any of these rights, email{" "}
                        <a className="text-amber-300 underline underline-offset-2" href="mailto:info@jigzack.com">
                            info@jigzack.com
                        </a>
                        . If you are not happy with how we handle your request, you can complain to the Nigeria Data
                        Protection Commission.
                    </p>
                </LegalSection>

                <LegalSection heading="Children">
                    <p>Our service is for adults. We do not knowingly collect information from anyone under 18.</p>
                </LegalSection>

                <LegalSection heading="Changes to this page">
                    <p>
                        If we change how we handle your information, we will update this page and the date at the top. For
                        important changes we will also tell account holders by email. Our{" "}
                        <Link className="text-amber-300 underline underline-offset-2" href="/terms">
                            Terms of Service
                        </Link>{" "}
                        explain the rules for using your account.
                    </p>
                </LegalSection>
            </LegalPage>
        </>
    );
}
