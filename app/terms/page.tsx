import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import LegalPage, { LegalList, LegalSection } from "@/components/LegalPage";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "Terms of Service",
    description:
        "The terms for using Jigzack Cleaning Services: accounts, pickups, monthly charges, vacant units, and what we each agree to.",
    path: "/terms",
});

export default function TermsPage() {
    return (
        <>
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Terms of Service", path: "/terms" },
                ])}
            />

            <LegalPage
                title="Terms of Service"
                updated="23 September 2026"
                intro="These terms cover your use of the Jigzack Cleaning Services website and your customer account. By creating an account or using our service you agree to them. If something here is unclear, ask us before you sign up."
            >
                <LegalSection heading="About us and the service">
                    <p>
                        Jigzack Cleaning Services is a LAWMA-approved solid waste disposal company. We collect waste from
                        homes and commercial premises in Lagos and Port Harcourt on a schedule, and we run waste education
                        sessions. You can contact us at{" "}
                        <a className="text-amber-300 underline underline-offset-2" href="mailto:info@jigzack.com">
                            info@jigzack.com
                        </a>{" "}
                        or on 0703 433 9721.
                    </p>
                </LegalSection>

                <LegalSection heading="Your account">
                    <LegalList
                        items={[
                            "Give us accurate details and keep them up to date, especially your address and the number and type of units on the property.",
                            "You need to confirm your email address, and we review every new account. You can use your dashboard once we approve it. We may decline an application.",
                            "There is a one time registration fee, shown at checkout. Tenants who are linked to an estate account do not pay a separate fee.",
                            "Keep your password private. You are responsible for what happens under your account, so tell us at once if you think someone else has used it.",
                            "Employee accounts are by invitation from us only.",
                        ]}
                    />
                </LegalSection>

                <LegalSection heading="Pickups">
                    <LegalList
                        items={[
                            "We schedule pickups from the frequency you tell us you want. Your dates appear in your dashboard.",
                            "Dates can move because of weather, road conditions, holidays or vehicle problems. When that happens we will update your schedule.",
                            "Put your waste where our crew can reach it, in bins or bags that are properly closed.",
                            "Tell us what kind of waste you produce. We may refuse waste we are not set up to handle safely.",
                            "Our crew photograph the collection point before and after each pickup to record the work. See our Privacy Policy for how those photos are used.",
                        ]}
                    />
                </LegalSection>

                <LegalSection heading="Charges and payment">
                    <LegalList
                        items={[
                            "Your monthly charge depends on the type of property and the number of units. It is on your invoice.",
                            "We create invoices in your dashboard. You can view, print, download or share them, and you get a receipt once a payment is recorded.",
                            "Pay using the payment details shown on your invoice. Any unpaid amount carries over to your next invoice as arrears.",
                            "If we make a mistake on an invoice, tell us and we will correct it.",
                        ]}
                    />
                </LegalSection>

                <LegalSection heading="Vacant units and estates">
                    <p>
                        If a unit on your property becomes vacant, the landlord or estate manager must tell us. Once we
                        record it, the vacant unit is left off your invoice. We cannot adjust a charge for a vacancy we
                        were not told about.
                    </p>
                    <p>
                        For an estate, the estate account receives one shared invoice. Tenants linked to the estate can
                        view it and can contact us about their unit.
                    </p>
                </LegalSection>

                <LegalSection heading="Using the website">
                    <p>Please do not misuse the service. That includes:</p>
                    <LegalList
                        items={[
                            "giving false information or using someone else's details,",
                            "trying to reach accounts or data that are not yours,",
                            "interfering with how the site works,",
                            "using it for anything unlawful.",
                        ]}
                    />
                </LegalSection>

                <LegalSection heading="Suspending or ending an account">
                    <p>
                        You can ask us to close your account at any time. We may pause or close an account if invoices stay
                        unpaid, if the details you gave were false, or if these terms are broken. Money you already owe
                        remains due after an account closes.
                    </p>
                </LegalSection>

                <LegalSection heading="Our responsibility">
                    <p>
                        We take care to collect and dispose of waste properly and in line with our LAWMA approval. We are
                        not responsible for delays or missed pickups caused by things outside our control, such as
                        flooding, road closures or strikes. Nothing in these terms limits any right or responsibility that
                        the law does not allow us to limit.
                    </p>
                </LegalSection>

                <LegalSection heading="Changes and governing law">
                    <p>
                        We may update these terms. The date at the top shows the latest version, and we will tell account
                        holders about important changes. These terms are governed by the laws of the Federal Republic of
                        Nigeria.
                    </p>
                    <p>
                        How we handle your personal information is described in our{" "}
                        <Link className="text-amber-300 underline underline-offset-2" href="/privacy">
                            Privacy Policy
                        </Link>
                        .
                    </p>
                </LegalSection>
            </LegalPage>
        </>
    );
}
