import { Parent, ResolveField, Resolver } from '@nestjs/graphql'

import { VaccineImage } from './vaccine-image.embed'
import { VaccineImageUrlService } from './vaccine-image-url.service'

@Resolver(() => VaccineImage)
export class VaccineImageFieldsResolver {
  constructor(private readonly vaccineImageUrlService: VaccineImageUrlService) {}

  @ResolveField(() => String, {
    nullable: true,
    description:
      'Short-lived image read URL when available; null until Phase 25C storage URLs are enabled',
  })
  imageUrl(@Parent() image: VaccineImage): Promise<string | null> {
    return this.vaccineImageUrlService.resolveReadUrl(image)
  }
}
