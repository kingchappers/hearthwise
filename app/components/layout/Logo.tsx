import { Group, Image, Text, type ImageProps } from '@mantine/core';
import markLight from '../../../docs/brand/logo/hearthwise-mark.svg';
import markDark from '../../../docs/brand/logo/hearthwise-mark-dark-bg.svg';

// The mark alone, square: an arch with a small flame inside it. Keep at least a quarter of its width of clear space around it
// (docs/brand.md). Both versions are rendered and CSS shows the one for the current scheme, so a visitor whose scheme is set
// in Settings never sees the wrong one flash up first.
// Decorative by default: pass a label when it is the only thing naming the page.
export function Mark({ size, alt = '', ...props }: { size: number; alt?: string } & Omit<ImageProps, 'src' | 'w' | 'h'>) {
  return (
    <>
      <Image src={markLight} alt={alt} darkHidden fit="contain" w={size} h={size} {...props} />
      <Image src={markDark} alt={alt} lightHidden fit="contain" w={size} h={size} {...props} />
    </>
  );
}

// The mark followed by the name. The name is text, not a picture, so it follows the text size setting and needs no font
// embedded in an image.
export function Logo({ height, className }: { height: number; className?: string }) {
  return (
    <Group gap={8} wrap="nowrap" className={className}>
      <Mark size={height} />
      <Text component="span" fw={600} lh={1} fz={Math.round(height * 0.6)} style={{ fontFamily: 'var(--mantine-font-family-headings)' }}>
        Hearthwise
      </Text>
    </Group>
  );
}
