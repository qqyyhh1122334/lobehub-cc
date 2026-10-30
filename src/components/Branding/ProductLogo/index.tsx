'use client';

import { Flexbox } from '@lobehub/ui';
import { type LobeHubProps } from '@lobehub/ui/brand';
import { LobeHub } from '@lobehub/ui/brand';
import { memo } from 'react';

import { isCustomBranding } from '@/const/version';

import CustomLogo from './Custom';

interface ProductLogoProps extends LobeHubProps {
  height?: number;
  width?: number;
}

export const ProductLogo = memo<ProductLogoProps>((props) => {
  if (isCustomBranding) {
    return <CustomLogo {...props} />;
  }

  // The upstream default (and its combined mark) downloads a 3D logo from a CDN.
  // Flat, mono and text variants are inline SVGs bundled with the application.
  if (props.type === 'combine') {
    const { size = 32, style, ...rest } = props;
    return (
      <Flexbox horizontal align="center" gap={Math.round(size / 4)} style={style}>
        <LobeHub size={size} type="flat" />
        <LobeHub {...rest} size={size} type="text" />
      </Flexbox>
    );
  }

  return <LobeHub {...props} type={!props.type || props.type === '3d' ? 'flat' : props.type} />;
});
