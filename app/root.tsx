import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@fontsource-variable/lora/wght.css';

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { APP_NAME, APP_DESCRIPTION, pageTitle } from "./lib/pageTitle";
import { BRAND, dark, gray, hearth, honey, sage } from "./lib/brand";
import { Mark } from "./components/layout/Logo";
import { ReduceMotion } from "./components/layout/ReduceMotion";
import { TextSize } from "./components/layout/TextSize";
import { TEXT_SIZE_SCRIPT } from "./lib/textSize";

import { Button, ColorSchemeScript, Progress, Tabs, Group, MantineProvider, Stack, Text, Title, mantineHtmlProps, createTheme, useMantineTheme, type CSSVariablesResolver } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export const theme = createTheme({
  primaryColor: 'hearth',
  respectReducedMotion: true,
  // Mantine's autoContrast text-color decision for a color used without an explicit shade (e.g.
  // color="hearth") reads primaryShade.light's luminance even when the button renders in dark mode.
  // Using shade 6 in both modes keeps that scheme-blind check right: white on hearth.6 is 6.8:1.
  // Dark-mode text and links do not use shade 6; see the -text overrides in cssVariablesResolver.
  primaryShade: { light: 6, dark: 6 },
  autoContrast: true,
  black: BRAND.ink,
  fontFamily: '"Lora Variable", Georgia, "Times New Roman", serif',
  headings: { fontFamily: '"Lora Variable", Georgia, serif', fontWeight: '600' },
  defaultRadius: 'md',
  // Bars and the active-tab line are non-text parts that need 3:1; the -text shade is the one that is
  // lighter in dark mode, where the button fill (shade 6) would be 2.3:1 on the page.
  components: {
    Progress: Progress.extend({ defaultProps: { color: 'var(--mantine-color-hearth-text)' } }),
    Tabs: Tabs.extend({ defaultProps: { color: 'var(--mantine-color-hearth-text)' } }),
  },
  colors: {
    hearth,
    // Something worth a look, in a soft yellow. There is no red: nothing in Hearthwise is shown as overdue or failed.
    honey,
    // "Done" states and calm confirmations.
    sage,
    dark,
    gray,
  },
});

// Page and text colours come from the brand: Ash behind cards in light mode, and the warm `dark` palette in dark mode.
// With no red in the palette, error text (form validation) uses the terracotta: a dark shade in light mode, the
// brand's lighter text shade in dark mode. Dark mode points the -text variables at the brand's lighter shades, because
// Mantine reads shade 4 for them, which is too dim on a card, and shade 6 (the button fill) for nothing else.
export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {},
  light: {
    '--mantine-color-body': BRAND.ash,
    '--mantine-color-dimmed': theme.colors.gray[6],
    '--mantine-color-error': theme.colors.hearth[7],
  },
  dark: {
    '--mantine-color-dimmed': theme.colors.dark[2],
    '--mantine-color-error': BRAND.darkHearthText,
    '--mantine-color-hearth-text': BRAND.darkHearthText,
    '--mantine-color-anchor': BRAND.darkHearthText,
    '--mantine-color-honey-text': BRAND.darkHoneyText,
    '--mantine-color-honey-filled': BRAND.darkHoneyText,
    '--mantine-color-sage-text': BRAND.darkSageText,
  },
});

function ResponsiveNotifications() {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`);
  return <Notifications position={isDesktop ? 'bottom-left' : 'bottom-center'} />;
}

export const meta: Route.MetaFunction = () => [{ title: pageTitle() }];

// Portrait iOS launch images: the file's pixel size, then the device's CSS size and pixel ratio.
const APPLE_SPLASH_SCREENS = [
  { file: '1290x2796', width: 430, height: 932, ratio: 3 },
  { file: '1179x2556', width: 393, height: 852, ratio: 3 },
  { file: '1170x2532', width: 390, height: 844, ratio: 3 },
  { file: '750x1334', width: 375, height: 667, ratio: 2 },
  { file: '2048x2732', width: 1024, height: 1366, ratio: 2 },
];

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  ...APPLE_SPLASH_SCREENS.map(({ file, width, height, ratio }) => ({
    rel: "apple-touch-startup-image",
    href: `/splash/apple-splash-${file}.png`,
    media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio})`,
  })),
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={BRAND.ink} />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={BRAND.surface} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="application-name" content={APP_NAME} />
        <meta name="description" content={APP_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={APP_NAME} />
        <meta property="og:description" content={APP_DESCRIPTION} />
        <ColorSchemeScript defaultColorScheme="auto" />
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <MantineProvider defaultColorScheme="auto" theme={theme} cssVariablesResolver={cssVariablesResolver}>
            <ReduceMotion />
            <TextSize />
            <ResponsiveNotifications />
            <DatesProvider settings={{ locale: 'en-gb' }}>{children}</DatesProvider>
          </MantineProvider>
        </QueryClientProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <main className="pt-16 p-4 container mx-auto">
      <Stack maw={560}>
        <Mark size={56} />
        <Title order={1} size="h2">
          {notFound ? "We couldn't find that page" : "Something didn't load. Your data is safe."}
        </Title>
        <Text>
          {notFound
            ? 'The link may be out of date. You can go back to Home.'
            : 'Reload the page to try again. If it keeps happening, go back to Home.'}
        </Text>
        <Group>
          {!notFound && <Button onClick={() => window.location.reload()}>Reload</Button>}
          <Button component="a" href="/" variant={notFound ? 'filled' : 'default'}>Go to Home</Button>
        </Group>
        {stack && (
          <pre className="w-full p-4 overflow-x-auto">
            <code>{stack}</code>
          </pre>
        )}
      </Stack>
    </main>
  );
}
