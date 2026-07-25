import { Parent, ResolveField, Resolver } from '@nestjs/graphql'

import { VaccineImage } from './vaccine-image.embed'
import { VaccineImageUrlService } from './vaccine-image-url.service'

@Resolver(() => VaccineImage)
export class VaccineImageFieldsResolver {
  constructor(private readonly vaccineImageUrlService: VaccineImageUrlService) {}

  @ResolveField(() => String, {
    nullable: true,
    description:
      'Short-lived image read URL for browseable images; null when absent or not browseable. Generated at response time — never persisted or cached with vaccine documents.',
  })
  imageUrl(@Parent() image: VaccineImage): Promise<string | null> {
    return this.vaccineImageUrlService.resolveReadUrl(image)
  }
}
